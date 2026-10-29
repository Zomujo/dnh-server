import { Types } from 'mongoose';
import {
	adherenceRateOf,
	type DoseLog,
	dayAdherence,
	doseOfLog,
	type ResolvedDose,
	resolveDoses,
	type ScheduledMedication,
	type ScheduleVersion,
	scheduledDoses,
} from './dose-schedule';

const medication: ScheduledMedication = {
	_id: new Types.ObjectId(),
	name: 'Metformin',
	startDate: new Date('2026-06-01T08:00:00'),
	createdAt: new Date('2026-06-01T07:00:00'),
	morning: { time: { hour: 8, minutes: 0, timeDesignators: 'AM' } },
	evening: { time: { hour: 8, minutes: 0, timeDesignators: 'PM' } },
};

const log = (fields: Partial<DoseLog>): DoseLog => ({
	_id: new Types.ObjectId(),
	taken: true,
	status: 'taken',
	...fields,
});

describe('dose-schedule', () => {
	describe('scheduledDoses', () => {
		it('expects one dose per section per day, from the start day on', () => {
			const doses = scheduledDoses(
				medication,
				new Date('2026-05-31T00:00:00'),
				new Date('2026-06-02T23:59:59'),
			);

			expect(doses.map((d) => [d.scheduledFor, d.section])).toEqual([
				[new Date('2026-06-01T08:00:00'), 'morning'],
				[new Date('2026-06-01T20:00:00'), 'evening'],
				[new Date('2026-06-02T08:00:00'), 'morning'],
				[new Date('2026-06-02T20:00:00'), 'evening'],
			]);
		});

		it('skips doses scheduled before the medication was added', () => {
			const addedAt3pm = {
				...medication,
				createdAt: new Date('2026-06-01T15:00:00'),
			};

			const doses = scheduledDoses(
				addedAt3pm,
				new Date('2026-06-01T00:00:00'),
				new Date('2026-06-01T23:59:59'),
			);

			expect(doses.map((d) => d.section)).toEqual(['evening']);
		});

		it('stops after the end date', () => {
			const ended = { ...medication, endDate: new Date('2026-06-01') };

			const doses = scheduledDoses(
				ended,
				new Date('2026-06-01T00:00:00'),
				new Date('2026-06-03T00:00:00'),
			);

			expect(doses).toHaveLength(2);
		});
	});

	describe('scheduledDoses after a schedule change', () => {
		const eightAm = { hour: 8, minutes: 0, timeDesignators: 'AM' };
		const onePm = { hour: 1, minutes: 0, timeDesignators: 'PM' };
		const eightPm = { hour: 8, minutes: 0, timeDesignators: 'PM' };
		const twice = {
			effectiveFrom: new Date('2026-06-01T07:00:00'),
			morning: eightAm,
			evening: eightPm,
		};
		const withHistory = (
			current: Partial<ScheduledMedication>,
			...versions: ScheduleVersion[]
		): ScheduledMedication => ({
			...medication,
			morning: null,
			afternoon: null,
			evening: null,
			...current,
			scheduleHistory: versions,
		});
		const sectionsOn = (med: ScheduledMedication, day: string) =>
			scheduledDoses(
				med,
				new Date(`${day}T00:00:00`),
				new Date(`${day}T23:59:59`),
			).map((d) => d.section);

		it('keeps the days before a dose was added as they were', () => {
			const added = withHistory(
				{
					morning: { time: eightAm },
					afternoon: { time: onePm },
					evening: { time: eightPm },
				},
				twice,
				{
					effectiveFrom: new Date('2026-06-03T10:00:00'),
					morning: eightAm,
					afternoon: onePm,
					evening: eightPm,
				},
			);

			expect(sectionsOn(added, '2026-06-02')).toEqual(['morning', 'evening']);
			// Added at 10 AM: 1 PM is still to come, so today counts it.
			expect(sectionsOn(added, '2026-06-03')).toEqual([
				'morning',
				'afternoon',
				'evening',
			]);
		});

		it('starts a dose added after its time on the next day', () => {
			const added = withHistory(
				{ morning: { time: eightAm }, evening: { time: eightPm } },
				{ effectiveFrom: new Date('2026-06-01T07:00:00'), evening: eightPm },
				{
					effectiveFrom: new Date('2026-06-03T10:00:00'),
					morning: eightAm,
					evening: eightPm,
				},
			);

			expect(sectionsOn(added, '2026-06-03')).toEqual(['evening']);
			expect(sectionsOn(added, '2026-06-04')).toEqual(['morning', 'evening']);
		});

		it('keeps a removed dose on the days it was still planned', () => {
			const eveningRemovedAt = (at: string) =>
				withHistory({ morning: { time: eightAm } }, twice, {
					effectiveFrom: new Date(at),
					morning: eightAm,
				});
			const removedAt9pm = eveningRemovedAt('2026-06-02T21:00:00');
			const removedAt2pm = eveningRemovedAt('2026-06-02T14:00:00');

			expect(sectionsOn(removedAt2pm, '2026-06-01')).toEqual([
				'morning',
				'evening',
			]);
			// Already due when it was removed: still planned that day.
			expect(sectionsOn(removedAt9pm, '2026-06-02')).toEqual([
				'morning',
				'evening',
			]);
			// Still to come when it was removed: not planned.
			expect(sectionsOn(removedAt2pm, '2026-06-02')).toEqual(['morning']);
			expect(sectionsOn(removedAt9pm, '2026-06-03')).toEqual(['morning']);
		});

		it('counts a dose moved on its day once, at its new time', () => {
			const moved = withHistory(
				{
					morning: { time: { hour: 9, minutes: 0, timeDesignators: 'AM' } },
					evening: { time: eightPm },
				},
				twice,
				{
					effectiveFrom: new Date('2026-06-02T08:30:00'),
					morning: { hour: 9, minutes: 0, timeDesignators: 'AM' },
					evening: eightPm,
				},
			);

			const doses = scheduledDoses(
				moved,
				new Date('2026-06-02T00:00:00'),
				new Date('2026-06-02T23:59:59'),
			);
			expect(doses.map((d) => [d.scheduledFor, d.section])).toEqual([
				[new Date('2026-06-02T09:00:00'), 'morning'],
				[new Date('2026-06-02T20:00:00'), 'evening'],
			]);
		});

		it('keeps a dose moved earlier while still to come', () => {
			const movedEarlier = withHistory(
				{
					morning: { time: { hour: 7, minutes: 0, timeDesignators: 'AM' } },
					evening: { time: eightPm },
				},
				twice,
				{
					effectiveFrom: new Date('2026-06-02T07:30:00'),
					morning: { hour: 7, minutes: 0, timeDesignators: 'AM' },
					evening: eightPm,
				},
			);

			expect(sectionsOn(movedEarlier, '2026-06-02')).toEqual([
				'morning',
				'evening',
			]);
		});

		it('plans nothing from when the medication was deleted', () => {
			const deleted = {
				...medication,
				deletedAt: new Date('2026-06-02T10:00:00'),
			};

			expect(sectionsOn(deleted, '2026-06-01')).toEqual(['morning', 'evening']);
			// Its 8 AM dose was already due: it still counts, taken or not.
			expect(sectionsOn(deleted, '2026-06-02')).toEqual(['morning']);
			expect(sectionsOn(deleted, '2026-06-03')).toEqual([]);
		});

		it('picks up a schedule saved without a version from its last save', () => {
			const savedElsewhere = withHistory(
				{
					morning: { time: eightAm },
					afternoon: { time: onePm },
					evening: { time: eightPm },
					updatedAt: new Date('2026-06-03T10:00:00'),
				},
				twice,
			);

			expect(sectionsOn(savedElsewhere, '2026-06-02')).toEqual([
				'morning',
				'evening',
			]);
			expect(sectionsOn(savedElsewhere, '2026-06-03')).toEqual([
				'morning',
				'afternoon',
				'evening',
			]);
		});
	});

	describe('doseOfLog', () => {
		it('uses the stored section', () => {
			const dose = doseOfLog(
				log({
					scheduledFor: new Date('2026-06-02T09:00:00'),
					section: 'evening',
				}),
				medication,
			);
			expect(dose?.section).toBe('evening');
		});

		it('matches an older log to the nearest section, after a time change', () => {
			const dose = doseOfLog(
				log({ scheduledFor: new Date('2026-06-02T09:00:00') }),
				medication,
			);
			expect(dose?.section).toBe('morning');
		});

		it('falls back to takenAt when the log has no scheduledFor', () => {
			const takenAt = new Date('2026-06-02T21:15:00');
			expect(doseOfLog(log({ takenAt }), medication)).toEqual({
				at: takenAt,
				section: 'evening',
			});
		});
	});

	describe('resolveDoses', () => {
		const from = new Date('2026-06-01T00:00:00');
		const to = new Date('2026-06-03T23:59:59');
		const now = new Date('2026-06-03T12:00:00');

		it('gives each dose a status', () => {
			const doses = resolveDoses(
				medication,
				[
					log({ scheduledFor: new Date('2026-06-01T08:00:00') }),
					log({
						scheduledFor: new Date('2026-06-01T20:00:00'),
						taken: false,
						status: 'missed',
					}),
					log({
						scheduledFor: new Date('2026-06-02T08:00:00'),
						status: 'partial',
					}),
				],
				from,
				to,
				now,
			);

			expect(doses.map((d) => d.status)).toEqual([
				'taken', // Jun 1 morning
				'missed', // Jun 1 evening, logged
				'partial', // Jun 2 morning
				'pending', // Jun 2 evening, still confirmable
				'pending', // Jun 3 morning
				'pending', // Jun 3 evening, not due yet
			]);
		});

		it('counts an unlogged dose as missed once its window closes', () => {
			const [first] = resolveDoses(
				medication,
				[],
				from,
				to,
				new Date('2026-06-03T08:00:01'),
			);
			expect(first.status).toBe('missed');
			expect(first.logId).toBeUndefined();
		});

		it("keeps a late confirm on the dose's own day", () => {
			const doses = resolveDoses(
				medication,
				[
					log({
						scheduledFor: new Date('2026-06-01T20:00:00'),
						takenAt: new Date('2026-06-02T07:30:00'),
						status: 'partial',
					}),
				],
				from,
				to,
				now,
			);

			expect(doses[1]).toMatchObject({
				scheduledFor: new Date('2026-06-01T20:00:00'),
				section: 'evening',
				status: 'partial',
			});
			// Jun 2 gains nothing from it: its morning dose is still open.
			expect(doses[2]).toMatchObject({ section: 'morning', status: 'pending' });
		});

		it('never counts a dose from before the medication was added', () => {
			const addedAt10pm = {
				...medication,
				createdAt: new Date('2026-06-01T22:00:00'),
			};

			const doses = resolveDoses(
				addedAt10pm,
				[
					log({
						scheduledFor: new Date('2026-06-01T08:00:00'),
						section: 'morning',
					}),
					log({
						scheduledFor: new Date('2026-06-01T20:00:00'),
						section: 'evening',
					}),
				],
				from,
				new Date('2026-06-01T23:59:59'),
				now,
			);

			expect(doses).toEqual([]);
		});

		it('counts a dose confirmed before its time was moved once, as taken', () => {
			const moved: ScheduledMedication = {
				...medication,
				morning: { time: { hour: 8, minutes: 5, timeDesignators: 'AM' } },
				scheduleHistory: [
					{
						effectiveFrom: new Date('2026-06-01T07:00:00'),
						morning: { hour: 8, minutes: 0, timeDesignators: 'AM' },
						evening: { hour: 8, minutes: 0, timeDesignators: 'PM' },
					},
					{
						effectiveFrom: new Date('2026-06-03T08:02:00'),
						morning: { hour: 8, minutes: 5, timeDesignators: 'AM' },
						evening: { hour: 8, minutes: 0, timeDesignators: 'PM' },
					},
				],
			};

			const doses = resolveDoses(
				moved,
				[
					log({
						scheduledFor: new Date('2026-06-03T08:00:00'),
						section: 'morning',
					}),
				],
				new Date('2026-06-03T00:00:00'),
				new Date('2026-06-03T23:59:59'),
				now,
			);

			expect(doses.map((d) => [d.section, d.status])).toEqual([
				['morning', 'taken'],
				['evening', 'pending'],
			]);
		});

		const morningLog = log({
			scheduledFor: new Date('2026-06-03T08:00:00'),
			section: 'morning',
		});
		const june3 = [
			new Date('2026-06-03T00:00:00'),
			new Date('2026-06-03T23:59:59'),
		] as const;

		it('drops a log for a dose the versioned schedule no longer plans', () => {
			const morningRemoved: ScheduledMedication = {
				...medication,
				morning: null,
				scheduleHistory: [
					{
						effectiveFrom: new Date('2026-06-01T07:00:00'),
						morning: { hour: 8, minutes: 0, timeDesignators: 'AM' },
						evening: { hour: 8, minutes: 0, timeDesignators: 'PM' },
					},
					{
						effectiveFrom: new Date('2026-06-02T10:00:00'),
						evening: { hour: 8, minutes: 0, timeDesignators: 'PM' },
					},
				],
			};

			const doses = resolveDoses(morningRemoved, [morningLog], ...june3, now);

			expect(doses.map((d) => d.section)).toEqual(['evening']);
		});

		it('still counts a log for a section removed before versions were kept', () => {
			const morningRemoved = { ...medication, morning: null };

			const doses = resolveDoses(morningRemoved, [morningLog], ...june3, now);

			expect(doses.map((d) => [d.section, d.status])).toEqual([
				['morning', 'taken'],
				['evening', 'pending'],
			]);
		});

		it('prefers a taken log over a missed one for the same dose', () => {
			const [first] = resolveDoses(
				medication,
				[
					log({
						scheduledFor: new Date('2026-06-01T08:00:00'),
						taken: false,
						status: 'missed',
					}),
					log({ takenAt: new Date('2026-06-01T08:20:00') }),
				],
				from,
				to,
				now,
			);
			expect(first.status).toBe('taken');
		});
	});

	describe('dayAdherence', () => {
		const now = new Date('2026-10-28T12:00:00');
		const dose = (
			at: string,
			status: ResolvedDose['status'],
		): ResolvedDose => ({
			scheduledFor: new Date(at),
			section: 'morning',
			status,
		});

		it('is false once the day is over with a dose not taken', () => {
			expect(
				dayAdherence(
					[
						dose('2026-10-27T08:00:00', 'taken'),
						dose('2026-10-27T20:00:00', 'pending'),
					],
					new Date('2026-10-27T00:00:00'),
					now,
				),
			).toEqual({ taken: false, takenDoses: 1, scheduledDoses: 2 });
		});

		it('is true once every dose is taken, today included', () => {
			expect(
				dayAdherence(
					[dose('2026-10-28T08:00:00', 'partial')],
					new Date('2026-10-28T00:00:00'),
					now,
				).taken,
			).toBe(true);
		});

		it('stays null today until every dose is taken', () => {
			expect(
				dayAdherence(
					[
						dose('2026-10-28T08:00:00', 'taken'),
						dose('2026-10-28T20:00:00', 'pending'),
					],
					new Date('2026-10-28T00:00:00'),
					now,
				).taken,
			).toBeNull();
		});

		it('is null on a day that scheduled nothing', () => {
			expect(
				dayAdherence([], new Date('2026-10-26T00:00:00'), now).taken,
			).toBeNull();
		});
	});

	describe('adherenceRateOf', () => {
		const now = new Date('2026-10-28T12:00:00');
		const dose = (
			at: string,
			status: ResolvedDose['status'],
		): ResolvedDose => ({
			scheduledFor: new Date(at),
			section: 'morning',
			status,
		});

		it('counts doses over the days that are settled', () => {
			// Monday 1 of 2, Tuesday 2 of 2, today and tomorrow left out.
			expect(
				adherenceRateOf(
					[
						dose('2026-10-26T08:00:00', 'taken'),
						dose('2026-10-26T20:00:00', 'pending'),
						dose('2026-10-27T08:00:00', 'taken'),
						dose('2026-10-27T20:00:00', 'partial'),
						dose('2026-10-28T08:00:00', 'missed'),
						dose('2026-10-28T20:00:00', 'pending'),
						dose('2026-10-29T08:00:00', 'pending'),
					],
					now,
				),
			).toBe(75);
		});

		it('is null before any day has settled', () => {
			expect(
				adherenceRateOf([dose('2026-10-28T08:00:00', 'pending')], now),
			).toBeNull();
		});
	});
});
