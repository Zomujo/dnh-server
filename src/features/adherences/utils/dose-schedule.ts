import {
	addDays,
	endOfDay,
	format,
	max as latest,
	set,
	startOfDay,
} from 'date-fns';
import { Types } from 'mongoose';
import { MAX_DOSE_CONFIRM_BACKDATE_HOURS } from '@/features/medications/dto/today.dto';

/**
 * Dose-level adherence: which doses a medication's schedule expects, and
 * what became of each one. Every adherence figure (the missed-dose job, the
 * rates, the week view, the month history) is computed from here, so they
 * can't disagree about which dose a log belongs to.
 *
 * Day boundaries come from date-fns in the process zone, which is pinned to
 * Africa/Accra (src/set-time-zone.ts).
 */

export const DOSE_SECTIONS = ['morning', 'afternoon', 'evening'] as const;
export type DoseSection = (typeof DOSE_SECTIONS)[number];

export type DoseStatus = 'taken' | 'partial' | 'missed' | 'pending';

export interface DoseTime {
	hour: number;
	minutes: number;
	timeDesignators?: string;
}

/** The medication fields the schedule is built from. */
export interface ScheduledMedication {
	_id: Types.ObjectId;
	name: string;
	patient?: unknown;
	startDate?: Date;
	endDate?: Date;
	createdAt?: Date;
	morning?: { time?: DoseTime } | null;
	afternoon?: { time?: DoseTime } | null;
	evening?: { time?: DoseTime } | null;
}

/** The log fields a dose is resolved from. */
export interface DoseLog {
	_id: Types.ObjectId;
	scheduledFor?: Date;
	takenAt?: Date;
	taken: boolean;
	status?: string;
	section?: DoseSection;
}

export interface ResolvedDose {
	scheduledFor: Date;
	section: DoseSection;
	status: DoseStatus;
	/** The log that settled this dose, when there is one. */
	logId?: string;
}

/**
 * The 12h → 24h dose arithmetic. Case-normalised: a lowercase "pm" slipping
 * through would leave an evening dose at 08:00, colliding with the morning
 * dose on the unique (userId, medication, scheduledFor) index.
 */
export function toDoseTimeOfDay(time: DoseTime): {
	hours: number;
	minutes: number;
} {
	const { hour, minutes, timeDesignators } = time;
	const designator = timeDesignators?.toUpperCase();
	let hours = hour;
	if (designator === 'PM' && hours !== 12) hours += 12;
	if (designator === 'AM' && hours === 12) hours = 0;
	return { hours, minutes };
}

/** The occurrence of a scheduled dose time on `day`. */
export function doseTimeOn(time: DoseTime, day: Date = new Date()): Date {
	return set(startOfDay(day), {
		...toDoseTimeOfDay(time),
		seconds: 0,
		milliseconds: 0,
	});
}

function sectionTimes(medication: ScheduledMedication) {
	return DOSE_SECTIONS.flatMap((section) => {
		const time = medication[section]?.time;
		return time ? [{ section, time }] : [];
	});
}

/**
 * When the medication's doses begin to count. Doses on its start day count
 * (the same rule confirmMedication applies), but not ones scheduled before
 * the medication was added: adding an evening medication at 3 pm doesn't
 * make that morning's dose missed.
 */
function firstCountedDose(medication: ScheduledMedication): Date | null {
	if (!medication.startDate) return null;
	const start = startOfDay(medication.startDate);
	return medication.createdAt ? latest([start, medication.createdAt]) : start;
}

/** Every dose the schedule expects within [from, to], oldest first. */
export function scheduledDoses(
	medication: ScheduledMedication,
	from: Date,
	to: Date,
): { scheduledFor: Date; section: DoseSection }[] {
	const first = firstCountedDose(medication);
	if (!first) return [];
	const last = medication.endDate ? endOfDay(medication.endDate) : null;
	const sections = sectionTimes(medication);

	const doses: { scheduledFor: Date; section: DoseSection }[] = [];
	for (let day = startOfDay(from); day <= to; day = addDays(day, 1)) {
		for (const { section, time } of sections) {
			const scheduledFor = doseTimeOn(time, day);
			if (scheduledFor < from || scheduledFor > to) continue;
			if (scheduledFor < first) continue;
			if (last && scheduledFor > last) continue;
			doses.push({ scheduledFor, section });
		}
	}
	return doses.sort(
		(a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime(),
	);
}

const minutesOfDay = (date: Date) => date.getHours() * 60 + date.getMinutes();

/**
 * Which dose a log settles: its day, and its section. New logs store the
 * section; older ones are matched to the section whose time is nearest, so
 * a schedule moved from 8:00 to 9:00 still finds yesterday's 8:00 log.
 * Older logs without `scheduledFor` fall back to `takenAt`.
 */
export function doseOfLog(
	log: DoseLog,
	medication: ScheduledMedication,
): { at: Date; section: DoseSection } | null {
	const at = log.scheduledFor ?? log.takenAt;
	if (!at) return null;
	if (log.section) return { at, section: log.section };

	let nearest: { section: DoseSection; distance: number } | null = null;
	for (const { section, time } of sectionTimes(medication)) {
		const { hours, minutes } = toDoseTimeOfDay(time);
		const distance = Math.abs(minutesOfDay(at) - (hours * 60 + minutes));
		if (!nearest || distance < nearest.distance) {
			nearest = { section, distance };
		}
	}
	return nearest ? { at, section: nearest.section } : null;
}

const doseKey = (at: Date, section: DoseSection) =>
	`${format(at, 'yyyy-MM-dd')}|${section}`;

function statusOfLog(log: DoseLog): DoseStatus {
	if (!log.taken) return 'missed';
	return log.status === 'partial' ? 'partial' : 'taken';
}

/**
 * What became of each dose in [from, to]: every dose the schedule expects,
 * plus any dose a log settled that the schedule no longer expects (a
 * section removed since, or confirmed before the medication was added).
 *
 * A dose with no log is `pending` while it can still be confirmed, and
 * `missed` once its confirm window has closed, even before the missed-dose
 * job has written its log.
 */
export function resolveDoses(
	medication: ScheduledMedication,
	logs: DoseLog[],
	from: Date,
	to: Date,
	now: Date = new Date(),
): ResolvedDose[] {
	const byDose = new Map<string, { at: Date; log: DoseLog }>();
	for (const log of logs) {
		const dose = doseOfLog(log, medication);
		if (!dose || dose.at < from || dose.at > to) continue;
		const key = doseKey(dose.at, dose.section);
		// A taken log wins over a missed one for the same dose.
		const existing = byDose.get(key);
		if (!existing || (!existing.log.taken && log.taken)) {
			byDose.set(key, { at: dose.at, log });
		}
	}

	const confirmWindowMs = MAX_DOSE_CONFIRM_BACKDATE_HOURS * 3_600_000;
	const resolved: ResolvedDose[] = [];
	for (const { scheduledFor, section } of scheduledDoses(
		medication,
		from,
		to,
	)) {
		const key = doseKey(scheduledFor, section);
		const settled = byDose.get(key);
		byDose.delete(key);
		if (settled) {
			resolved.push({
				scheduledFor,
				section,
				status: statusOfLog(settled.log),
				logId: settled.log._id.toString(),
			});
			continue;
		}
		const windowClosed =
			now.getTime() - scheduledFor.getTime() > confirmWindowMs;
		resolved.push({
			scheduledFor,
			section,
			status: windowClosed ? 'missed' : 'pending',
		});
	}

	for (const [key, { at, log }] of byDose) {
		resolved.push({
			scheduledFor: at,
			section: key.split('|')[1] as DoseSection,
			status: statusOfLog(log),
			logId: log._id.toString(),
		});
	}

	return resolved.sort(
		(a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime(),
	);
}

const isTaken = (dose: ResolvedDose) =>
	dose.status === 'taken' || dose.status === 'partial';

/**
 * One day's adherence: `true` once every dose it scheduled was taken,
 * `false` once the day is over with a dose not taken, and `null` while it
 * can still go either way (today, the future) or when it scheduled nothing.
 * A dose confirmed late turns a `false` day `true`, so this is worked out
 * fresh from the doses every time, never stored.
 */
export function dayAdherence(
	dayDoses: ResolvedDose[],
	day: Date,
	now: Date = new Date(),
): { taken: boolean | null; takenDoses: number; scheduledDoses: number } {
	const takenDoses = dayDoses.filter(isTaken).length;
	const scheduledDoses = dayDoses.length;
	let taken: boolean | null = null;
	if (scheduledDoses > 0 && startOfDay(day) <= now) {
		if (takenDoses === scheduledDoses) taken = true;
		else if (endOfDay(day) < now) taken = false;
	}
	return { taken, takenDoses, scheduledDoses };
}

/**
 * Doses taken ÷ doses scheduled, as a whole percentage, over the days
 * `dayAdherence` has settled (`taken` not null). `partial` (taken, but
 * late) counts as taken. Null when no day has settled yet, so the caller
 * can tell "no data" from a genuine 0%.
 */
export function adherenceRateOf(
	doses: ResolvedDose[],
	now: Date = new Date(),
): number | null {
	const byDay = new Map<string, ResolvedDose[]>();
	for (const dose of doses) {
		const key = format(dose.scheduledFor, 'yyyy-MM-dd');
		const dayDoses = byDay.get(key);
		if (dayDoses) dayDoses.push(dose);
		else byDay.set(key, [dose]);
	}

	let taken = 0;
	let scheduled = 0;
	for (const dayDoses of byDay.values()) {
		const day = dayAdherence(dayDoses, dayDoses[0].scheduledFor, now);
		if (day.taken === null) continue;
		taken += day.takenDoses;
		scheduled += day.scheduledDoses;
	}
	return scheduled === 0 ? null : Math.round((taken / scheduled) * 100);
}
