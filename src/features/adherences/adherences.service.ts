import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
	endOfMonth,
	endOfWeek,
	startOfMonth,
	startOfWeek,
	subDays,
} from 'date-fns';
import { Model } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';
import { flattenMeta } from '../../common/entities/base-dh.entity';
import {
	AdherenceLogQueryFilter,
	AdherencePatternQueryFilter,
	CreateAdherenceDto,
	UpdateAdherenceDto,
} from './dto';
import { AdherenceLog, TargetType } from './entities/adherence-log.entity';
import { AdherencePattern } from './entities/adherence-pattern.entity';

@Injectable()
export class AdherencesService {
	constructor(
		@InjectModel(AdherenceLog.name)
		private adherenceLogModel: Model<AdherenceLog>,
		@InjectModel(AdherencePattern.name)
		private adherencePatternModel: Model<AdherencePattern>,
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

		return adherenceLog._id;
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
	) {
		const filter: Record<string, any> = {
			userId,
			targetType,
			targetName: new RegExp(targetName, 'i'),
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
		const thirtyDaysAgo = subDays(new Date(), 30);

		const result = await this.adherenceLogModel.aggregate([
			{
				$match: {
					userId,
					targetType: TargetType.MEDICATION,
					takenAt: { $gte: thirtyDaysAgo },
				},
			},
			{
				$group: {
					_id: null,
					total: { $sum: 1 },
					taken: { $sum: { $cond: ['$taken', 1, 0] } },
				},
			},
		]);

		if (!result.length) {
			return 0;
		}

		return Math.round((result[0].taken / result[0].total) * 100);
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
			if (dateKey >= todayKey) {
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

	async removePatternsByUserId(userId: string) {
		return this.adherencePatternModel.deleteMany({ userId });
	}

	async updateManyAdherenceLogs(
		filter: Record<string, any>,
		update: Record<string, any>,
	) {
		return this.adherenceLogModel.updateMany(filter, update);
	}
}
