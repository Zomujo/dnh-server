import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { addDays, format, getWeekOfMonth } from 'date-fns';
import { Model, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';
import { generateFilter } from '@/common/factory';
import { PatientsService } from '@/features/patients/patients.service';
import { flattenMeta } from '../../common/entities/base-dh.entity';
import { CreateDhVectorDto, DHDocumentType } from '../dh-vectors/dto';
import {
	BpTrendsQueryDto,
	BpTrendsResponseDto,
	CreateVitalHistoryDto,
	DateRange,
	FilterVitalHistoriesDto,
	fullDayMap,
	getDateRangeFilter,
	LoadVitalHistoryDto,
	shortenedDay,
	UpdateVitalHistoryDto,
	VitalHistoryQueryFilter,
	VitalHistoryTrendsQueryDto,
	VitalHistoryTrendsResponseDto,
	VitalHistoryUpsertInput,
	VitalTypes,
} from './dto';
import {
	VitalHistory,
	VitalSeverityEnum,
} from './entities/vital-history.entity';

@Injectable()
export class VitalHistoriesService {
	constructor(
		@InjectModel(VitalHistory.name)
		private vitalHistoryModel: Model<VitalHistory>,
		private readonly patientsService: PatientsService,
	) {}

	async loadVitalHistory(dto: LoadVitalHistoryDto, userId: string) {
		// const severity = this.determineSeverity(dto.vitalType, dto.value);
		const unit =
			dto.vitalType === 'bloodPressure'
				? 'mmHg'
				: dto.vitalType === 'bloodSugar'
					? 'mmol/L'
					: '';

		const vitalHistory = await this.vitalHistoryModel.create({
			userId,
			patient: new Types.ObjectId(dto.patient),
			vitalType: dto.vitalType,
			value: dto.value,
			unit,
			recordedAt: dto.recordedAt,
		});

		return vitalHistory._id;
	}

	private determineSeverity(
		vitalType: string,
		value: string,
	): VitalSeverityEnum {
		if (vitalType === 'bloodPressure') {
			const parts = value.split('/');
			if (parts.length !== 2) {
				return VitalSeverityEnum.NORMAL;
			}

			const systolic = Number.parseFloat(parts[0]);
			const diastolic = Number.parseFloat(parts[1]);

			if (Number.isNaN(systolic) || Number.isNaN(diastolic)) {
				return VitalSeverityEnum.NORMAL;
			}

			if (systolic >= 140 || diastolic >= 90) {
				return VitalSeverityEnum.CRITICAL;
			}

			if (systolic >= 130 || diastolic >= 85) {
				return VitalSeverityEnum.ELEVATED;
			}

			return VitalSeverityEnum.NORMAL;
		}

		if (vitalType === 'bloodSugar') {
			const mgdl = Number.parseFloat(value);

			if (Number.isNaN(mgdl)) {
				return VitalSeverityEnum.NORMAL;
			}

			if (mgdl <= 3.9 || mgdl > 11.0) {
				return VitalSeverityEnum.CRITICAL;
			}

			if (mgdl > 7.0) {
				return VitalSeverityEnum.ELEVATED;
			}

			return VitalSeverityEnum.NORMAL;
		}

		return VitalSeverityEnum.NORMAL;
	}

	async create(dto: CreateVitalHistoryDto, personnelId: string) {
		const clusterId = new Types.ObjectId();
		const patient = await this.patientsService.findPatientById(
			dto.patient,
			'userId',
		);

		if (!patient) {
			throw new NotFoundException('Patient not found');
		}

		const dhVectorsData: CreateDhVectorDto[] = [];

		const input = await Promise.all(
			dto.vitals.map(async (vital) => {
				const summary = this.generateVitalSummary({
					...vital,
					recordedAt: dto.recordedAt,
					notes: dto.notes,
				} as Partial<VitalHistory>);

				const data = {
					_id: new Types.ObjectId(),
					userId: patient.userId,
					patient: dto.patient,
					clusterId,
					recordedAt: dto.recordedAt,
					notes: dto.notes,
					createdBy: personnelId,
					...vital,
				};

				dhVectorsData.push({
					userId: patient.userId,
					patient: dto.patient,
					documentType: DHDocumentType.VITAL_HISTORY,
					documentId: data._id.toString(),
					summary,
				});

				return data;
			}),
		);

		await this.vitalHistoryModel.insertMany(input);
		// await this.dhVectorsService.bulkCreate(dhVectorsData);

		await this.patientsService.updatePatientById(dto.patient, {
			$addToSet: { pharmaciesVisited: personnelId },
		});

		return clusterId;
	}

	async upsertVitalHistory(
		filters: Record<string, any>,
		dto: VitalHistoryUpsertInput,
	) {
		const qdrantId = uuidv7();
		const vitalHistory = await this.vitalHistoryModel.findOneAndUpdate(
			filters,
			{
				$set: { ...dto },
				$setOnInsert: { qdrantId },
			},
			{ returnDocument: 'after', upsert: true },
		);
		// const summary = this.generateVitalSummary(vitalHistory);
		//
		// await this.dhVectorsService.create({
		// 	qdrantId: vitalHistory.qdrantId,
		// 	userId: filters.userId,
		// 	patient: filters.patient,
		// 	documentType: DHDocumentType.VITAL_HISTORY,
		// 	documentId: vitalHistory._id.toString(),
		// 	summary,
		// });

		return vitalHistory._id;
	}

	private generateVitalSummary(vital: Partial<VitalHistory>): string {
		const parts: string[] = [];

		// 1. Core Measurement
		const type = vital.vitalType?.replace(/_/g, ' ');
		const subType = vital.vitalSubType
			? ` (${vital.vitalSubType.replace(/_/g, ' ')})`
			: '';

		if (vital.vitalType && vital.value) {
			parts.push(
				`Vital Sign: ${type}${subType} recorded as ${vital.value} ${vital.unit || ''}.`,
			);
		}

		// 2. Clinical Interpretation (The "So What?")
		if (vital.severity && vital.severity !== VitalSeverityEnum.NORMAL) {
			parts.push(`Status: This reading is classified as ${vital.severity}.`);
		} else if (vital.severity === VitalSeverityEnum.NORMAL) {
			parts.push(`Status: This reading is within the normal range.`);
		}

		// 4. Temporal Context
		if (vital.recordedAt) {
			const dateStr = new Date(vital.recordedAt).toLocaleString();
			parts.push(`Time of recording: ${dateStr}.`);
		}

		// 5. Qualitative Observations
		if (vital.notes) {
			parts.push(`Clinical notes: ${vital.notes}`);
		}

		if (vital.meta) {
			const flatMeta = flattenMeta(vital.meta);
			parts.push(`Additional clinical observations: ${flatMeta}`);
		}

		if (vital.createdAt && vital.updatedAt) {
			parts.push(
				`Vital History Created At: ${new Date(vital.createdAt).toLocaleString()} and Updated At: ${new Date(vital.updatedAt).toLocaleString()}`,
			);
		}

		return parts.join(' ');
	}

	async findAllByQuery(filters: VitalHistoryQueryFilter) {
		let query = this.vitalHistoryModel
			.find(filters.query)
			.limit(filters.limit ?? 10)
			.sort({ createdAt: -1 });

		if (filters.projection) {
			query = query.select(filters.projection);
		}

		const results = await query.lean();

		return results;
	}

	async fetchAnalytics(input: {
		personnelId: string;
		timestamp?: Record<string, any>;
	}) {
		const { personnelId, timestamp } = input;

		const match: Record<string, any> = {
			createdBy: personnelId,
		};
		if (timestamp) {
			match.createdAt = timestamp;
		}

		const vitalsRecorded = await this.vitalHistoryModel.aggregate([
			{
				$match: {
					...match,
				},
			},
			{
				$group: {
					_id: '$clusterId',
				},
			},
			{ $count: 'total' },
		]);
		const vitalsRecordedCount: number = vitalsRecorded[0]?.total || 0;

		const patients = await this.vitalHistoryModel.aggregate([
			{
				$match: {
					...match,
				},
			},
			{
				$group: {
					_id: '$patient',
				},
			},
			{ $count: 'total' },
		]);
		const patientsCount: number = patients[0]?.total || 0;
		return { patientsCount, vitalsRecordedCount };
	}

	async findAll(query: FilterVitalHistoriesDto) {
		const { pageFilter } = generateFilter(query);
		const result = await this.vitalHistoryModel.aggregate([
			{
				$match: {
					clusterId: {
						$ne: null,
					},
				},
			},
			{
				$sort: {
					recordedAt: -1,
				},
			},
			{
				$addFields: {
					patientId: {
						$toObjectId: '$patient',
					},
				},
			},
			{
				$group: {
					_id: '$clusterId',
					id: {
						$first: '$clusterId',
					},
					patientId: {
						$first: '$patientId',
					},
					recordedAt: {
						$first: '$recordedAt',
					},
				},
			},
			{
				$lookup: {
					from: 'patients',
					localField: 'patientId',
					foreignField: '_id',
					as: 'patient',
				},
			},
			{
				$unwind: '$patient',
			},
			{
				$project: {
					_id: 0,
					id: 1,
					patientId: 1,
					recordedAt: 1,
					'patient.id': '$patient._id',
					'patient.name': 1,
					'patient.patientCode': 1,
				},
			},
			{
				$skip: pageFilter.offset,
			},
			{
				$limit: pageFilter.limit,
			},
		]);

		const countPipeline = [
			{
				$match: {
					clusterId: { $ne: null },
				},
			},
			{ $group: { _id: '$clusterId' } },
			{ $count: 'total' },
		];

		const totalResult = await this.vitalHistoryModel.aggregate(countPipeline);
		const total: number = totalResult[0]?.total || 0;
		return { rows: result, count: total };
	}

	async findOne(id: string) {
		const clusterId = new Types.ObjectId(id);
		const vitalHistoryByCluster = await this.vitalHistoryModel.aggregate([
			{
				$match: {
					clusterId,
				},
			},
			{
				$group: {
					_id: '$clusterId',
					id: { $first: '$clusterId' },
					userId: {
						$first: '$userId',
					},
					patientId: {
						$first: '$patient',
					},
					notes: {
						$first: '$notes',
					},
					recordedAt: {
						$first: '$recordedAt',
					},
					vitals: {
						$push: {
							vitalType: '$vitalType',
							value: '$value',
							unit: '$unit',
							severity: '$severity',
						},
					},
				},
			},
			{
				$unset: '_id',
			},
		]);
		if (!vitalHistoryByCluster[0]) {
			throw new NotFoundException('Vital history not found');
		}

		return vitalHistoryByCluster[0];
	}

	async update(id: string, dto: UpdateVitalHistoryDto) {
		const clusterVitalHistory = await this.vitalHistoryModel
			.find({ clusterId: id })
			.lean();

		const { vitals, ...others } = dto;

		try {
			if (vitals) {
				await this.vitalHistoryModel.deleteMany({ clusterId: id });

				const vitalsInput = vitals.map((vital) => {
					const vHistory = clusterVitalHistory[0];

					const replacement = {
						userId: vHistory.userId,
						patient: vHistory.patient,
						clusterId: id,
						recordedAt: dto.recordedAt ?? vHistory.recordedAt,
						notes: dto.notes ?? vHistory.notes,
						createdBy: vHistory.createdBy,
						createdAt: vHistory.createdAt,
						...vital,
					};
					return replacement;
				});
				const input = vitalsInput.filter((vital) => vital);

				await this.vitalHistoryModel.insertMany(input);
			} else {
				await this.vitalHistoryModel.updateMany(
					{ clusterId: id },
					{ ...others },
				);
			}
		} catch {
			await this.vitalHistoryModel.insertMany(clusterVitalHistory);
		}

		return id;
	}

	async remove(id: string) {
		const vitalHistory = await this.vitalHistoryModel.deleteMany({
			clusterId: id,
		});
		if (!vitalHistory) {
			throw new NotFoundException('Vital history not found');
		}

		return;
	}

	async fetchVitalHistory(userId: string) {
		// const { pageFilter } = generateFilter(query);

		const vitalHistories = await this.vitalHistoryModel.aggregate<VitalHistory>(
			[
				// 1. Match only this patient's vitals
				{
					$match: {
						$or: [{ userId: userId }, { patient: userId }],
					},
				},

				// 2. Sort by createdAt DESC (latest first)
				{ $sort: { createdAt: -1 } },

				// {
				// 	$skip: pageFilter.offset, // pagination: offset
				// },
				// {
				// 	$limit: pageFilter.limit, // pagination: number of parent groups
				// },

				// 3. Group by type, keeping only the first (latest) record
				{
					$group: {
						_id: '$vitalType',
						doc: { $first: '$$ROOT' },
					},
				},

				// 4. Replace root with the document
				{ $replaceRoot: { newRoot: '$doc' } },

				{
					$addFields: {
						vitalName: {
							$switch: {
								branches: [
									{
										case: { $eq: ['$vitalType', 'bloodPressure'] },
										then: 'Blood Pressure',
									},
									{
										case: { $eq: ['$vitalType', 'heartRate'] },
										then: 'Heart Rate',
									},
									{
										case: { $eq: ['$vitalType', 'temperature'] },
										then: 'Temperature',
									},
									{
										case: { $eq: ['$vitalType', 'respirationRate'] },
										then: 'Respiration Rate',
									},
									{
										case: { $eq: ['$vitalType', 'oxygenSaturation'] },
										then: 'Oxygen Saturation',
									},
									{ case: { $eq: ['$vitalType', 'weight'] }, then: 'Weight' },
									{
										case: { $eq: ['$vitalType', 'bloodSugar'] },
										then: 'Blood Sugar',
									},
								],
								default: '$vitalType',
							},
						},
					},
				},

				{
					$project: {
						id: '$_id',
						_id: 0,
						vitalType: 1,
						vitalName: 1,
						value: 1,
						unit: 1,
						severity: 1,
					},
				},
			],
		);

		const countPipeline = [
			{ $group: { _id: '$vitalType' } },
			{ $count: 'total' },
		];

		const totalResult = await this.vitalHistoryModel.aggregate(countPipeline);
		const total: number = totalResult[0]?.total || 0;

		return { rows: vitalHistories, count: total };
	}

	async listVitalHistoryLogs(userId: string, offset: number, limit: number) {
		const skip = offset;

		const results = await this.vitalHistoryModel.aggregate<
			Record<string, unknown>
		>([
			{
				$match: {
					$or: [{ userId }, { patient: userId }],
				},
			},
			{ $sort: { createdAt: -1 } },
			{ $skip: skip },
			{ $limit: limit },
			{
				$addFields: {
					vitalName: {
						$switch: {
							branches: [
								{
									case: { $eq: ['$vitalType', 'bloodPressure'] },
									then: 'Blood Pressure',
								},
								{
									case: { $eq: ['$vitalType', 'heartRate'] },
									then: 'Heart Rate',
								},
								{
									case: { $eq: ['$vitalType', 'temperature'] },
									then: 'Temperature',
								},
								{
									case: { $eq: ['$vitalType', 'respirationRate'] },
									then: 'Respiration Rate',
								},
								{
									case: { $eq: ['$vitalType', 'oxygenSaturation'] },
									then: 'Oxygen Saturation',
								},
								{ case: { $eq: ['$vitalType', 'weight'] }, then: 'Weight' },
								{
									case: { $eq: ['$vitalType', 'bloodSugar'] },
									then: 'Blood Sugar',
								},
							],
							default: '$vitalType',
						},
					},
				},
			},
			{
				$project: {
					id: '$_id',
					_id: 0,
					vitalType: 1,
					vitalName: 1,
					value: 1,
					unit: 1,
					severity: 1,
				},
			},
		]);

		const count = await this.vitalHistoryModel.countDocuments({
			$or: [{ userId }, { patient: userId }],
		});

		return { rows: results, count };
	}

	async fetchBPTrend(userId: string, query: BpTrendsQueryDto) {
		const { dateRange } = query;
		const { timestamp } = getDateRangeFilter(dateRange)!;

		const match = {
			$or: [{ userId }, { patient: userId }],
			vitalType: VitalTypes.BLOOD_PRESSURE,
			recordedAt: timestamp,
		};

		const vitalTrend = await this.vitalHistoryModel.aggregate([
			{ $match: match },
			{
				$addFields: {
					pressureParts: { $split: ['$value', '/'] },
				},
			},

			{
				$addFields: {
					systolic: { $toInt: { $arrayElemAt: ['$pressureParts', 0] } },
					diastolic: { $toInt: { $arrayElemAt: ['$pressureParts', 1] } },
				},
			},

			{ $sort: { recordedAt: 1 } },
			{
				$group: {
					_id: null,
					labels: { $push: '$recordedAt' },
					systolic: { $push: '$systolic' },
					diastolic: { $push: '$diastolic' },
				},
			},
			{ $unset: '_id' },
		]);

		const latest = await this.vitalHistoryModel
			.findOne(match)
			.sort({ recordedAt: -1 })
			.select('value')
			.lean();

		let formattedVitalTrend = vitalTrend[0];

		if (!formattedVitalTrend) {
			return { labels: [], systolic: [], diastolic: [], latestValue: null };
		}

		return {
			...formattedVitalTrend,
			latestValue: latest?.value ?? null,
		};
	}

	private normalizeBpChartData(
		dateRange: DateRange,
		data: BpTrendsResponseDto,
		timestamp: { $gte: Date; $lte: Date },
	) {
		const weekLabels: string[] = this.getLabels(dateRange, timestamp);
		const monthLabels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];

		if (data.labels.includes('Week 5')) {
			monthLabels.push('Week 5');
		}

		if (dateRange === DateRange.TODAY) {
			return data;
		}

		const labels = dateRange === DateRange.THIS_WEEK ? weekLabels : monthLabels;

		const systolic = labels.map((label) => {
			const index = data.labels.indexOf(label);

			const val = !data.systolic[index]
				? null
				: +data.systolic[index].toFixed(2);
			return val;
		});

		const diastolic = labels.map((label) => {
			const index = data.labels.indexOf(label);

			const val = !data.diastolic[index]
				? null
				: +data.diastolic[index].toFixed(2);
			return val;
		});

		let labelFormatted = labels;

		if (dateRange === DateRange.THIS_WEEK) {
			labelFormatted = labels.map((label) => shortenedDay[label]);
		}
		return { labels: labelFormatted, systolic, diastolic };
	}

	async fetchVitalTrend(userId: string, query: VitalHistoryTrendsQueryDto) {
		const { vitalType, dateRange } = query;
		const { timestamp } = getDateRangeFilter(dateRange)!;

		const matchRecord: Record<string, any> = {
			vitalType,
			recordedAt: timestamp,
		};

		if (query.vitalType === 'bloodSugar') {
			matchRecord.vitalSubType = 'fastingBloodSugar';
		}

		const vitalTrend = await this.vitalHistoryModel.aggregate([
			{
				$match: {
					$or: [{ userId }, { patient: userId }],
					...matchRecord,
				},
			},
			{ $addFields: { parsedValue: { $toDouble: '$value' } } },
			{ $sort: { recordedAt: 1 } },
			{
				$group: {
					_id: null,
					labels: { $push: '$recordedAt' },
					values: { $push: '$parsedValue' },
				},
			},
			{ $unset: '_id' },
		]);

		const latest = await this.vitalHistoryModel
			.findOne({
				$or: [{ userId }, { patient: userId }],
				...matchRecord,
			})
			.sort({ recordedAt: -1 })
			.select('value')
			.lean();

		let formattedVitalTrend = vitalTrend[0];

		if (!formattedVitalTrend) {
			return {
				labels: [],
				values: [],
				latestValue: null,
			};
		}

		return {
			...formattedVitalTrend,
			latestValue: latest ? Number(latest.value) : null,
		};
	}

	private normalizeChartData(
		dateRange: DateRange,
		data: VitalHistoryTrendsResponseDto,
		timestamp: { $gte: Date; $lte: Date },
	) {
		const weekLabels: string[] = this.getLabels(dateRange, timestamp);

		const monthLabels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];

		if (data.labels.includes('Week 5')) {
			monthLabels.push('Week 5');
		}

		const labels = dateRange === DateRange.THIS_WEEK ? weekLabels : monthLabels;

		if (dateRange === DateRange.TODAY) {
			return data;
		}

		// Build new values array matching the desired labels
		const values = labels.map((label) => {
			const index = data.labels.indexOf(label);
			return data.values[index] ? +data.values[index].toFixed(2) : null;
		});

		let labelFormatted = labels;

		if (dateRange === DateRange.THIS_WEEK) {
			labelFormatted = labels.map((label) => shortenedDay[label]);
		}

		return { labels: labelFormatted, values: values || [] };
	}

	/**
	 * Formats an array of date labels based on the active date range.
	 *
	 * @param labels - Array of ISO date strings
	 * @param range - The selected date range
	 * @returns Formatted labels for charts
	 */
	private formatLabels(labels: string[], range: DateRange): string[] {
		const formatedLabels = labels.map((label) => {
			const date = new Date(label);

			switch (range) {
				case DateRange.TODAY:
					return format(date, 'hh:mm a');

				case DateRange.THIS_WEEK:
					return format(date, 'E');

				case DateRange.THIS_MONTH:
				case DateRange.LAST_MONTH:
					return `Week ${getWeekOfMonth(date)}`;

				default:
					return label;
			}
		});

		return this.expandDuplicateDays(formatedLabels);
	}

	private getLabels(range: DateRange, timestamp: { $gte: Date; $lte: Date }) {
		switch (range) {
			case DateRange.THIS_WEEK: {
				let labelRange: string[] = [];
				for (let i = 0; i <= 7; i++) {
					labelRange.push(addDays(timestamp.$gte, i).toISOString());
				}
				const rangeStr = this.formatLabels(labelRange, range);
				return rangeStr;
			}
			default:
				return [];
		}
	}

	private expandDuplicateDays(days: string[]): string[] {
		const seen = new Set<string>();

		return days.map((day) => {
			if (!seen.has(day)) {
				seen.add(day);
				return day;
			}

			return fullDayMap[day] ?? day;
		});
	}

	async removeByUserId(userId: string) {
		return this.vitalHistoryModel.deleteMany({ userId });
	}
}
