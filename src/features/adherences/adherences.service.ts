import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
	eachDayOfInterval,
	endOfMonth,
	endOfWeek,
	isSameDay,
	startOfDay,
	startOfMonth,
	startOfWeek,
	subDays,
	subHours,
} from 'date-fns';
import { Model, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';
import { flattenMeta } from '../../common/entities/base-dh.entity';
import { anyIdForm, escapeRegExp } from '../../common/utils/helpers';
import { AdherenceStatus } from '../../features/patients/dto';
import { Patient } from '../../features/patients/entities/patient.entity';
import { MAX_DOSE_CONFIRM_BACKDATE_HOURS } from '../medications/dto/today.dto';
import { Medication } from '../medications/entities/medication.entity';
import {
	AdherenceLogQueryFilter,
	AdherencePatternQueryFilter,
	CreateAdherenceDto,
	UpdateAdherenceDto,
} from './dto';
import {
	AdherenceLog,
	recordInSummary,
	Status,
	TargetType,
} from './entities/adherence-log.entity';
import {
	AdherencePattern,
	PatternTargetType,
} from './entities/adherence-pattern.entity';
import {
	adherenceRateOf,
	type DoseLog,
	dayAdherence,
	type ResolvedDose,
	resolveDoses,
	type ScheduledMedication,
} from './utils/dose-schedule';

/** Doses whose confirm window closed this long ago are still checked, so
 * the missed-dose job catches up after the server was down for a while. */
const MISSED_DOSE_LOOKBACK_HOURS = 72;

@Injectable()
export class AdherencesService {
	constructor(
		@InjectModel(AdherenceLog.name)
		private adherenceLogModel: Model<AdherenceLog>,
		@InjectModel(AdherencePattern.name)
		private adherencePatternModel: Model<AdherencePattern>,
		@InjectModel(Patient.name)
		private patientModel: Model<Patient>,
		@InjectModel(Medication.name)
		private medicationModel: Model<Medication>,
	) {}

	create(_createAdherenceDto: CreateAdherenceDto) {
		return 'This action adds a new adherence';
	}

	async upsertAdherenceLog(
		filters: Record<string, any>,
		dto: CreateAdherenceDto,
	) {
		const qdrantId = uuidv7();
		const adherenceLog = await this.adherenceLogModel.findOneAndUpdate(
			filters,
			{
				$set: { ...dto },
				$setOnInsert: { qdrantId },
			},
			{ returnDocument: 'after', upsert: true },
		);
		// const summary = this.generateAdherenceSummary(adherenceLog);
		//
		// await this.dhVectorsService.create({
		// 	qdrantId: adherenceLog.qdrantId,
		// 	userId: filters.userId,
		// 	patient: filters.patient,
		// 	documentType: DHDocumentType.ADHERENCE_LOG,
		// 	documentId: adherenceLog._id.toString(),
		// 	summary,
		// });

		const patientId = (dto as any).patient;
		if (patientId) {
			await this.refreshPatientAdherence(filters.userId, patientId, {
				lastCheckInDate: new Date(),
			});
		}

		return adherenceLog._id;
	}

	/** Recomputes the adherence rate and status shown to clinicians. */
	private async refreshPatientAdherence(
		userId: string,
		patientId: unknown,
		extra: Record<string, unknown> = {},
	) {
		const adherenceRate = await this.estimateAdherenceRate(userId);
		await this.patientModel.findByIdAndUpdate(patientId, {
			$set: {
				adherenceRate: adherenceRate ?? 0,
				adherenceStatus: this.determineAdherenceStatus(adherenceRate),
				...extra,
			},
		});
	}

	/**
	 * Looks up the single log for one specific dose instance — the same
	 * (userId, medication, scheduledFor) triple the unique index is built on.
	 * Used to answer "which log already claims this dose?" after a duplicate
	 * confirm, so the caller can respond idempotently instead of erroring.
	 */
	async findDoseLog(
		userId: string,
		medicationId: string | Types.ObjectId,
		scheduledFor: Date,
	) {
		return this.adherenceLogModel
			.findOne({
				userId,
				medication: new Types.ObjectId(medicationId),
				scheduledFor,
			})
			.select('_id status takenAt')
			.lean();
	}

	/**
	 * Adherence over the last 30 days: doses taken ÷ doses scheduled on the
	 * days that are settled (see `adherenceRateOf`), across every medication
	 * and section. Null when no day has settled yet, so the caller can tell
	 * "no data" from a genuine 0%.
	 */
	private async estimateAdherenceRate(userId: string): Promise<number | null> {
		const now = new Date();
		const perMedication = await this.resolveUserDoses(
			userId,
			startOfDay(subDays(now, 29)),
			now,
		);
		return adherenceRateOf(
			perMedication.flatMap(({ doses }) => doses),
			now,
		);
	}

	/**
	 * Every dose each of the user's medications expected within [from, to],
	 * and what became of it. Logs are matched by medication id, or by name
	 * for older logs that only carry the name.
	 */
	async resolveUserDoses(
		userId: string,
		from: Date,
		to: Date,
		{
			medicationId,
			now = new Date(),
		}: { medicationId?: string; now?: Date } = {},
	): Promise<{ medication: ScheduledMedication; doses: ResolvedDose[] }[]> {
		const [medications, logs] = await Promise.all([
			this.medicationModel
				.find({ userId, ...(medicationId && { _id: medicationId }) })
				.select(
					'name patient startDate endDate createdAt morning afternoon evening',
				)
				.lean<ScheduledMedication[]>(),
			this.adherenceLogModel
				.find({
					userId,
					targetType: TargetType.MEDICATION,
					$or: [
						{ scheduledFor: { $gte: from, $lte: to } },
						{
							scheduledFor: { $exists: false },
							takenAt: { $gte: from, $lte: to },
						},
					],
				})
				.select(
					'medication targetName scheduledFor takenAt taken status section',
				)
				.lean(),
		]);

		const logsByMedication = new Map<string, DoseLog[]>();
		for (const log of logs) {
			const owner = log.medication
				? medications.find((m) => m._id.equals(log.medication as any))
				: medications.find(
						(m) => m.name?.toLowerCase() === log.targetName?.toLowerCase(),
					);
			if (!owner) continue;
			const key = owner._id.toString();
			logsByMedication.set(key, [
				...(logsByMedication.get(key) ?? []),
				log as unknown as DoseLog,
			]);
		}

		return medications.map((medication) => ({
			medication,
			doses: resolveDoses(
				medication,
				logsByMedication.get(medication._id.toString()) ?? [],
				from,
				to,
				now,
			),
		}));
	}

	/**
	 * Writes a `missed` log for every dose whose confirm window has closed
	 * with no confirmation. Run hourly. Doses before a medication started, or
	 * sections it doesn't have, are never expected, and a deleted medication
	 * has no schedule left to expect anything. The unique index on
	 * (userId, medication, scheduledFor) makes a rerun a no-op.
	 */
	async recordMissedDoses(now: Date = new Date()) {
		const to = subHours(now, MAX_DOSE_CONFIRM_BACKDATE_HOURS);
		const from = subHours(to, MISSED_DOSE_LOOKBACK_HOURS);
		const userIds: string[] = await this.medicationModel.distinct('userId', {
			$or: [
				{ 'morning.time': { $exists: true } },
				{ 'afternoon.time': { $exists: true } },
				{ 'evening.time': { $exists: true } },
			],
		});

		let recorded = 0;
		for (const userId of userIds) {
			const perMedication = await this.resolveUserDoses(userId, from, to, {
				now,
			});
			let patientId: unknown;
			for (const { medication, doses } of perMedication) {
				for (const dose of doses) {
					if (dose.status !== 'missed' || dose.logId) continue;
					const inserted = await this.insertMissedLog(userId, medication, dose);
					if (inserted) {
						recorded += 1;
						patientId ??= medication.patient;
					}
				}
			}
			if (patientId) {
				await this.refreshPatientAdherence(userId, patientId);
			}
		}
		return recorded;
	}

	/**
	 * Inserts the log only if no log claims this dose yet, so a confirm that
	 * landed first is never overwritten. Then counts it in the patient's
	 * summary, as the findOneAndUpdate hook does for a confirm.
	 */
	private async insertMissedLog(
		userId: string,
		medication: ScheduledMedication,
		dose: ResolvedDose,
	): Promise<boolean> {
		let upsertedId: unknown;
		try {
			({ upsertedId } = await this.adherenceLogModel.updateOne(
				{ userId, medication: medication._id, scheduledFor: dose.scheduledFor },
				{
					$setOnInsert: {
						userId,
						patient: medication.patient,
						medication: medication._id,
						targetType: TargetType.MEDICATION,
						targetName: medication.name,
						scheduledFor: dose.scheduledFor,
						section: dose.section,
						taken: false,
						status: Status.MISSED,
						qdrantId: uuidv7(),
					},
				},
				{ upsert: true },
			));
		} catch (error: any) {
			// Another run inserted the same dose between our read and write.
			if (error?.code === 11000) return false;
			throw error;
		}
		if (!upsertedId) return false;

		const log = await this.adherenceLogModel.findById(upsertedId);
		if (log) await recordInSummary(log);
		return true;
	}

	private determineAdherenceStatus(rate: number | null): AdherenceStatus {
		if (rate === null) return AdherenceStatus.NO_DATA;
		if (rate >= 85) return AdherenceStatus.STABLE;
		if (rate >= 70) return AdherenceStatus.SILENT;
		return AdherenceStatus.CRITICAL;
	}

	private generateAdherenceSummary(log: Partial<AdherenceLog>): string {
		const parts: string[] = [];

		// 1. The Action & Target
		const target = log.targetName || 'unspecified target';
		const type = log.targetType?.replace(/_/g, ' ') || 'treatment';

		if (log.taken) {
			parts.push(
				`Adherence Success: Patient successfully completed the ${type} for "${target}".`,
			);
		} else {
			parts.push(
				`Adherence Gap: Patient missed the scheduled ${type} for "${target}".`,
			);
		}

		// 2. Status & Timing
		if (log.status) {
			const statusLabel =
				log.status === 'partial' ? 'only partially completed' : log.status;
			parts.push(`The status of this task is marked as ${statusLabel}.`);
		}

		if (log.takenAt) {
			const timeStr = new Date(log.takenAt).toLocaleString();
			parts.push(`Action timestamp: ${timeStr}.`);
		}

		// 3. Qualitative Insight (The "Why")
		if (log.notes) {
			parts.push(`Patient/Clinical notes: ${log.notes}`);
		}

		if (log.meta) {
			const flatMeta = flattenMeta(log.meta);
			parts.push(`Additional clinical observations: ${flatMeta}`);
		}

		if (log.createdAt && log.updatedAt) {
			parts.push(
				`Adherence Log Created At: ${new Date(log.createdAt).toLocaleString()} and Updated At: ${new Date(log.updatedAt).toLocaleString()}`,
			);
		}

		return parts.join(' ');
	}

	async findAllAdherenceLogsByQuery(filters: AdherenceLogQueryFilter) {
		let query = this.adherenceLogModel
			.find(filters.query)
			.limit(filters.limit ?? 10)
			.sort({ createdAt: -1 });

		if (filters.projection) {
			query = query.select(filters.projection);
		}

		const results = await query.lean();

		return results;
	}

	async upsertAdherencePattern(
		filters: Record<string, any>,
		dto: CreateAdherenceDto,
	) {
		const adherencePattern = await this.adherencePatternModel.findOneAndUpdate(
			filters,
			dto,
			{ returnDocument: 'after', upsert: true },
		);
		return adherencePattern._id;
	}

	async findAllAdherencePatternsByQuery(filters: AdherencePatternQueryFilter) {
		let query = this.adherencePatternModel
			.find(filters.query)
			.limit(filters.limit ?? 10)
			.sort({ createdAt: -1 });

		if (filters.projection) {
			query = query.select(filters.projection);
		}

		const results = await query.lean();

		return results;
	}

	findAll() {
		return `This action returns all adherences`;
	}

	findOne(id: number) {
		return `This action returns a #${id} adherence`;
	}

	update(id: number, _updateAdherenceDto: UpdateAdherenceDto) {
		return `This action updates a #${id} adherence`;
	}

	remove(id: number) {
		return `This action removes a #${id} adherence`;
	}

	/**
	 * Adherence over the last 7 days (today and the 6 before it): doses
	 * taken ÷ doses scheduled on the days that are settled (see
	 * `adherenceRateOf`), across every medication and section.
	 */
	async aggregateMedicationAdherence(userId: string) {
		const now = new Date();
		const perMedication = await this.resolveUserDoses(
			userId,
			startOfDay(subDays(now, 6)),
			now,
		);
		return (
			adherenceRateOf(
				perMedication.flatMap(({ doses }) => doses),
				now,
			) ?? 0
		);
	}

	/**
	 * This week, Monday to Sunday, one entry per day as `dayAdherence` sees
	 * it. `takenDoses` and `scheduledDoses` give the counts behind it.
	 */
	async aggregateMedicationTakenByWeek(userId: string) {
		const now = new Date();
		const weekStart = startOfWeek(now, { weekStartsOn: 1 });
		const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
		const doses = (
			await this.resolveUserDoses(userId, weekStart, weekEnd)
		).flatMap(({ doses }) => doses);

		const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
		return eachDayOfInterval({ start: weekStart, end: weekEnd }).map((date) => {
			const dayDoses = doses.filter((d) => isSameDay(d.scheduledFor, date));
			const { taken, takenDoses, scheduledDoses } = dayAdherence(
				dayDoses,
				date,
				now,
			);
			return {
				taken,
				dateTaken: date,
				label: dayLabels[date.getDay()],
				takenDoses,
				scheduledDoses,
			};
		});
	}

	/**
	 * One medication's month: one entry per scheduled dose, plus the older
	 * one-per-day `logs` for clients that still read them. A day in `logs`
	 * is as `dayAdherence` sees it.
	 */
	async medicationMonthHistory(
		userId: string,
		medicationId: string,
		date: Date,
	) {
		const monthStart = startOfMonth(date);
		const monthEnd = endOfMonth(date);
		const [entry] = await this.resolveUserDoses(userId, monthStart, monthEnd, {
			medicationId,
		});
		const doses = entry?.doses ?? [];
		const now = new Date();

		const logs = eachDayOfInterval({ start: monthStart, end: monthEnd }).map(
			(day) => {
				const dayDoses = doses.filter((d) => isSameDay(d.scheduledFor, day));
				return {
					takenAt: day,
					taken: dayAdherence(dayDoses, day, now).taken,
					id:
						dayDoses.find((d) => d.logId)?.logId ??
						new Types.ObjectId().toString(),
				};
			},
		);

		return {
			adherenceRate: adherenceRateOf(doses, now) ?? 0,
			logs,
			doses: doses.map(({ scheduledFor, section, status, logId }) => ({
				scheduledFor,
				section,
				status,
				...(logId && { id: logId }),
			})),
		};
	}

	async aggregateAdherencePatterns(
		userId: string,
		offset: number,
		limit: number,
		subsLimit: number = 4,
	) {
		return this.adherencePatternModel.aggregate([
			{ $match: { userId } },
			{
				$group: {
					_id: '$targetType',
					items: {
						$push: {
							id: '$_id',
							targetName: '$targetName',
							adherenceRate: '$adherenceRate',
							lastLoggedAt: '$lastLoggedAt',
							notes: '$notes',
						},
					},
				},
			},
			{
				$project: {
					targetType: '$_id',
					items: { $slice: ['$items', subsLimit] },
					_id: 0,
				},
			},
			{
				$sort: { targetType: 1 },
			},
			{
				$skip: offset,
			},
			{
				$limit: limit,
			},
		]);
	}

	async countAdherencePatternGroups(userId: string): Promise<number> {
		const result = await this.adherencePatternModel.aggregate([
			{ $match: { userId } },
			{ $group: { _id: '$targetType' } },
			{ $count: 'total' },
		]);
		return result[0]?.total || 0;
	}

	async removeLogsByUserId(userId: string) {
		return this.adherenceLogModel.deleteMany({ userId });
	}

	/**
	 * Removes a deleted medication's adherence history. Logs linked to the
	 * medication go by id. Patterns, and older logs that only carry the name,
	 * are kept per medication *name*, so they go only once no other medication
	 * of this user shares it; otherwise they still belong to that one.
	 */
	async removeMedicationHistory(
		userId: string,
		medicationId: Types.ObjectId | string,
		name: string,
		nameStillInUse: boolean,
	) {
		const { deletedCount: linkedLogs } =
			await this.adherenceLogModel.deleteMany({
				userId,
				// Mixed field: older rows may hold the id as a string.
				medication: anyIdForm(medicationId),
			});
		if (nameStillInUse) {
			return { logs: linkedLogs, patterns: 0 };
		}

		const sameName = new RegExp(`^${escapeRegExp(name)}$`, 'i');
		const [{ deletedCount: unlinkedLogs }, { deletedCount: patterns }] =
			await Promise.all([
				this.adherenceLogModel.deleteMany({
					userId,
					targetType: TargetType.MEDICATION,
					targetName: sameName,
					medication: { $exists: false },
				}),
				this.adherencePatternModel.deleteMany({
					userId,
					targetType: PatternTargetType.MEDICATION,
					targetName: sameName,
				}),
			]);
		return { logs: linkedLogs + unlinkedLogs, patterns };
	}

	async removePatternsByUserId(userId: string) {
		return this.adherencePatternModel.deleteMany({ userId });
	}
}
