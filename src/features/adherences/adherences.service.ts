import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
	differenceInCalendarDays,
	endOfMonth,
	endOfWeek,
	startOfMonth,
	startOfWeek,
	subDays,
} from 'date-fns';
import { Model } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';
import { flattenMeta } from '../../common/entities/base-dh.entity';
import { escapeRegExp } from '../../common/utils/helpers';
import { AdherenceStatus } from '../../features/patients/dto';
import { Patient } from '../../features/patients/entities/patient.entity';
import { Medication } from '../medications/entities/medication.entity';
import {
	AdherenceLogQueryFilter,
	AdherencePatternQueryFilter,
	CreateAdherenceDto,
	UpdateAdherenceDto,
} from './dto';
import { AdherenceLog, TargetType } from './entities/adherence-log.entity';
import {
	AdherencePattern,
	PatternTargetType,
} from './entities/adherence-pattern.entity';

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

		const adherenceRate = await this.estimateAdherenceRate(filters.userId);
		const adherenceStatus = this.determineAdherenceStatus(adherenceRate);

		const patientId = (dto as any).patient;
		if (patientId) {
			await this.patientModel.findByIdAndUpdate(patientId, {
				$set: {
					adherenceRate: adherenceRate ?? 0,
					adherenceStatus,
					lastCheckInDate: new Date(),
				},
			});
		}

		return adherenceLog._id;
	}

	/**
	 * Dose-based, medication-scoped adherence rate over a rolling 30-day
	 * window. Expected doses are derived from each medication's own
	 * doses/day (frequency.repeatEvery) and its actual tracked history
	 * length (clamped to 30 days and to its start/end dates) — not a fixed
	 * 30-day denominator, which previously produced >100% rates (the query
	 * window spans 31 calendar days, not 30) and falsely CRITICAL rates for
	 * newly-enrolled patients (a few days of perfect adherence divided by a
	 * fixed 30 reads as ~10%). Returns null when there are no medications
	 * with expected doses yet, so the caller can distinguish "no data" from
	 * a genuine 0% rate.
	 */
	private async estimateAdherenceRate(userId: string): Promise<number | null> {
		const now = new Date();
		const thirtyDaysAgo = subDays(now, 30);

		const medications = await this.medicationModel
			.find({ userId })
			.select('startDate endDate frequency')
			.lean();

		let expectedDoses = 0;
		for (const medication of medications) {
			if (!medication.startDate) continue;

			const dosesPerDay = medication.frequency?.repeatEvery || 1;
			const windowStart =
				medication.startDate > thirtyDaysAgo
					? medication.startDate
					: thirtyDaysAgo;
			const windowEnd =
				medication.endDate && medication.endDate < now
					? medication.endDate
					: now;

			if (windowEnd < windowStart) continue;

			const windowDays = differenceInCalendarDays(windowEnd, windowStart) + 1;
			expectedDoses += windowDays * dosesPerDay;
		}

		if (expectedDoses === 0) {
			return null;
		}

		// scheduledFor is the dose-instance identity for confirmations made via
		// confirmMedication(); older/AI-inferred logs may only have takenAt.
		const adherentDoses = await this.adherenceLogModel.countDocuments({
			userId,
			targetType: TargetType.MEDICATION,
			taken: true,
			$or: [
				{ scheduledFor: { $gte: thirtyDaysAgo } },
				{ scheduledFor: { $exists: false }, takenAt: { $gte: thirtyDaysAgo } },
			],
		});

		return parseFloat(((adherentDoses / expectedDoses) * 100).toFixed(2));
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

	async findAdherenceLogsByTarget(
		userId: string,
		targetType: TargetType,
		targetName: string,
		limit: number = 14,
		date?: Date,
		medicationId?: string,
	) {
		// Prefer the stable medication reference when available — an unanchored
		// name match would also match a differently-named medication that
		// happens to share a substring (e.g. "Met" matching "Metformin"), and a
		// renamed medication would silently lose its history under a
		// name-only lookup.
		const filter: Record<string, any> = medicationId
			? { userId, targetType, medication: medicationId }
			: {
					userId,
					targetType,
					targetName: new RegExp(`^${escapeRegExp(targetName)}$`, 'i'),
				};

		if (date) {
			const start = startOfMonth(date);
			const end = endOfMonth(date);
			filter.takenAt = { $gte: start, $lte: end };

			const results = await this.adherenceLogModel.aggregate([
				{ $match: filter },
				{ $sort: { takenAt: -1 } },
				{
					$group: {
						_id: {
							$dateToString: { format: '%Y-%m-%d', date: '$takenAt' },
						},
						doc: { $first: '$$ROOT' },
					},
				},
				{ $replaceRoot: { newRoot: '$doc' } },
				{ $sort: { takenAt: -1 } },
				{ $limit: limit },
				{ $project: { _id: 1, taken: 1, takenAt: 1 } },
			]);

			return results.map((r) => ({
				id: String(r._id),
				taken: r.taken,
				takenAt: r.takenAt,
			}));
		}

		return this.adherenceLogModel
			.find(filter)
			.sort({ takenAt: -1 })
			.limit(limit)
			.select('taken takenAt');
	}

	async aggregateMedicationAdherence(userId: string) {
		const now = new Date();
		const sevenDaysAgo = subDays(now, 7);
		// The [sevenDaysAgo, now] window spans 8 calendar days inclusive, not 7
		// — dividing by a fixed 7 let this exceed 100%. Same class of bug as
		// estimateAdherenceRate's 30-vs-31-day window.
		const windowDays = differenceInCalendarDays(now, sevenDaysAgo) + 1;

		const result = await this.adherenceLogModel.aggregate([
			{
				$match: {
					userId,
					targetType: TargetType.MEDICATION,
					taken: true,
					takenAt: { $gte: sevenDaysAgo },
				},
			},
			{
				$group: {
					_id: {
						$dateToString: { format: '%Y-%m-%d', date: '$takenAt' },
					},
				},
			},
			{
				$count: 'uniqueDays',
			},
		]);

		const uniqueDays = result.length ? result[0].uniqueDays : 0;
		return Math.round((uniqueDays / windowDays) * 100);
	}

	async aggregateMedicationTakenByWeek(userId: string) {
		const now = new Date();
		const weekStart = startOfWeek(now, { weekStartsOn: 1 });
		const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

		const logs = await this.adherenceLogModel.find({
			userId,
			targetType: TargetType.MEDICATION,
			takenAt: { $gte: weekStart, $lte: weekEnd },
		});

		const takenDates = new Set<string>();
		for (const log of logs) {
			if (log.taken) {
				const dateKey = log.takenAt.toISOString().slice(0, 10);
				takenDates.add(dateKey);
			}
		}

		const today = new Date();
		const todayKey = today.toISOString().slice(0, 10);

		const dayLabels: Record<number, string> = {
			1: 'M',
			2: 'T',
			3: 'W',
			4: 'T',
			5: 'F',
			6: 'S',
			0: 'S',
		};

		const days: { taken: boolean | null; dateTaken: Date; label: string }[] =
			[];
		for (let i = 0; i < 7; i++) {
			const date = new Date(weekStart);
			date.setDate(date.getDate() + i);
			const dateKey = date.toISOString().slice(0, 10);

			let taken: boolean | null;
			if (dateKey > todayKey) {
				taken = null;
			} else {
				taken = takenDates.has(dateKey);
			}

			days.push({
				taken,
				dateTaken: date,
				label: dayLabels[date.getDay()],
			});
		}

		return days;
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

	async removeLogsByTargetName(userId: string, targetName: string) {
		return this.adherenceLogModel.deleteMany({
			userId,
			targetType: TargetType.MEDICATION,
			targetName,
		});
	}

	async removePatternsByTargetName(userId: string, targetName: string) {
		return this.adherencePatternModel.deleteMany({
			userId,
			targetType: PatternTargetType.MEDICATION,
			targetName,
		});
	}

	async removePatternsByUserId(userId: string) {
		return this.adherencePatternModel.deleteMany({ userId });
	}
}
