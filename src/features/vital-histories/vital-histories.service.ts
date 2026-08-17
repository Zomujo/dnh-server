import {
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';
import { generateFilter } from '@/common/factory';
import { PatientsService } from '@/features/patients/patients.service';
import { flattenMeta } from '../../common/entities/base-dh.entity';
import { CreateDhVectorDto, DHDocumentType } from '../dh-vectors/dto';
import { PushService } from '../notifications/push/push.service';
import {
	BpTrendsQueryDto,
	CreateVitalHistoryDto,
	FilterVitalHistoriesDto,
	getDateRangeFilter,
	LoadVitalHistoryDto,
	UpdateVitalHistoryDto,
	UpdateVitalLogDto,
	VitalHistoryQueryFilter,
	VitalHistoryTrendsQueryDto,
	VitalHistoryUpsertInput,
	VitalTypes,
} from './dto';
import {
	CRITICAL_VITAL_SEVERITIES,
	VitalHistory,
	VitalSeverityEnum,
} from './entities/vital-history.entity';

@Injectable()
export class VitalHistoriesService {
	constructor(
		@InjectModel(VitalHistory.name)
		private vitalHistoryModel: Model<VitalHistory>,
		private readonly patientsService: PatientsService,
		private readonly pushService: PushService,
	) {}

	async loadVitalHistory(
		dto: LoadVitalHistoryDto,
		userId: string,
		facilityId?: string,
	) {
		const severity = this.determineSeverity(dto.vitalType, dto.value);
		const unit =
			dto.vitalType === 'bloodPressure'
				? 'mmHg'
				: dto.vitalType === 'bloodSugar'
					? 'mmol/L'
					: '';
		const [userBody, personnelBody] = this.buildVitalNotificationBody(
			dto.vitalType,
			severity,
		);

		await this.pushService.sendAugurNotification({
			userId: userId,
			title: 'Yelima',
			body: userBody,
		});

		if (CRITICAL_VITAL_SEVERITIES.includes(severity) && facilityId) {
			this.pushService.sendNotificationToTopic(
				() => ({
					notification: {
						title: 'Critical Patient Reading',
						body: personnelBody,
					},
					data: {
						notification_type: 'notification',
						click_action: 'FLUTTER_NOTIFICATION_CLICK',
					},
				}),
				facilityId,
			);
		}
		const vitalHistory = await this.vitalHistoryModel.create({
			userId,
			patient: new Types.ObjectId(dto.patient),
			vitalType: dto.vitalType,
			value: dto.value,
			unit,
			recordedAt: dto.recordedAt,
			severity,
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

			// AHA thresholds (mmHg): Normal <120/<80, Elevated 120-129/<80,
			// Stage 1 130-139/80-89, Stage 2 >=140/>=90 (both stages folded into
			// HYPERTENSIVE below — this system only needs "needs attention" vs
			// "needs urgent care", not the stage distinction), Hypertensive
			// Crisis >180/>120 (checked as >=180/>=120 to catch the boundary).
			// AHA doesn't define hypotension (it's hypertension-focused
			// guidance); <90/<60 and a conservative <80/<50 "severe" cutoff
			// are the commonly cited clinical thresholds.
			if (systolic >= 180 || diastolic >= 120) {
				return VitalSeverityEnum.HYPERTENSIVE_CRISIS;
			}
			if (systolic < 80 || diastolic < 50) {
				return VitalSeverityEnum.SEVERE_HYPOTENSION;
			}
			if (systolic >= 130 || diastolic >= 80) {
				return VitalSeverityEnum.HYPERTENSIVE;
			}
			if (systolic < 90 || diastolic < 60) {
				return VitalSeverityEnum.HYPOTENSIVE;
			}
			if (systolic >= 120) {
				return VitalSeverityEnum.ELEVATED;
			}
			return VitalSeverityEnum.NORMAL;
		}

		if (vitalType === 'bloodSugar') {
			const val = Number.parseFloat(value);

			if (Number.isNaN(val)) {
				return VitalSeverityEnum.NORMAL;
			}

			// ADA thresholds (mmol/L): Level 2 hypoglycemia <3.0, Level 1
			// hypoglycemia 3.0-<3.9, in-target 3.9-<7.3, elevated 7.3-<11.1
			// (11.1 mmol/L / 200mg/dL is a commonly used "significant
			// hyperglycemia" marker), high 11.1-<13.9, critically high >=13.9
			// (250mg/dL — the diagnostic DKA-risk threshold).
			if (val < 3.0) return VitalSeverityEnum.CRITICALLY_LOW;
			if (val < 3.9) return VitalSeverityEnum.LOW;
			if (val < 7.3) return VitalSeverityEnum.NORMAL;
			if (val < 11.1) return VitalSeverityEnum.ELEVATED;
			if (val < 13.9) return VitalSeverityEnum.HIGH;
			return VitalSeverityEnum.CRITICALLY_HIGH;
		}

		return VitalSeverityEnum.NORMAL;
	}

	private buildVitalNotificationBody(
		vitalType: string,
		severity: VitalSeverityEnum,
	): [userMessage: string, personnelMessage: string] {
		const vitalLabels: Record<string, string> = {
			bloodPressure: 'blood pressure',
			bloodSugar: 'blood sugar',
			heartRate: 'heart rate',
			temperature: 'temperature',
			respirationRate: 'respiration rate',
			oxygenSaturation: 'oxygen saturation',
			weight: 'weight',
		};

		const label = vitalLabels[vitalType] ?? vitalType;

		// Grouped rather than an exhaustive switch so every tier added above
		// (HYPERTENSIVE, HYPOTENSIVE, LOW, HIGH, etc.) lands on an explicit
		// message instead of silently falling through to "looks normal" —
		// that's exactly the kind of gap that would tell a patient in a
		// hypertensive crisis their reading was fine.
		if (severity === VitalSeverityEnum.NORMAL) {
			return [
				`Thanks for logging your ${label}. Your readings look normal — keep it up!`,
				`A patient has logged a normal ${label} reading.`,
			];
		}

		if (CRITICAL_VITAL_SEVERITIES.includes(severity)) {
			return [
				`Thanks for logging your ${label}. Your readings are critically out of range — please consult your doctor as soon as possible.`,
				`Critical alert: a patient has logged a ${label} reading that is critically out of range. Please review and follow up immediately.`,
			];
		}

		return [
			`Thanks for logging your ${label}. Your readings are slightly elevated — keep monitoring and stay in touch with your care team.`,
			`Notice: a patient has logged an elevated ${label} reading. You may want to check in with them.`,
		];
	}

	async create(
		dto: CreateVitalHistoryDto,
		personnelId: string,
		facilityId?: string,
	) {
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
				// Server-computed, not trusted from the client — this path
				// previously relied entirely on whatever severity the client
				// optionally submitted, with no independent verification (3.1)
				// and no critical-alert path at all for personnel-entered
				// readings (unlike loadVitalHistory()).
				const severity = this.determineSeverity(vital.vitalType, vital.value);

				if (CRITICAL_VITAL_SEVERITIES.includes(severity) && facilityId) {
					const [, personnelBody] = this.buildVitalNotificationBody(
						vital.vitalType,
						severity,
					);
					this.pushService.sendNotificationToTopic(
						() => ({
							notification: {
								title: 'Critical Patient Reading',
								body: personnelBody,
							},
							data: {
								notification_type: 'notification',
								click_action: 'FLUTTER_NOTIFICATION_CLICK',
							},
						}),
						facilityId,
					);
				}

				const summary = this.generateVitalSummary({
					...vital,
					severity,
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
					...(facilityId && { facility: facilityId }),
					...vital,
					severity,
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

	async update(id: string, dto: UpdateVitalHistoryDto, personnelId: string) {
		const clusterVitalHistory = await this.vitalHistoryModel
			.find({ clusterId: id })
			.lean();

		if (!clusterVitalHistory.length) {
			throw new NotFoundException('Vital history not found');
		}

		if (clusterVitalHistory[0].createdBy?.toString() !== personnelId) {
			throw new ForbiddenException(
				'Only the personnel who recorded this vital history can update it',
			);
		}

		const { vitals, ...others } = dto;

		if (vitals) {
			const vHistory = clusterVitalHistory[0];
			const recordedAt = dto.recordedAt ?? vHistory.recordedAt;
			const notes = dto.notes ?? vHistory.notes;

			// Upsert each vital by its natural key (clusterId + vitalType) instead
			// of deleting the whole cluster and reinserting it. This repo's
			// staging/prod MongoDB runs standalone (no replica set), so
			// multi-document transactions aren't available — a delete-then-insert
			// here would leave a window with zero documents for the cluster if
			// the process died in between. A single-document upsert is atomic on
			// its own without needing a transaction, so this never has that gap.
			await Promise.all(
				vitals.map((vital) => {
					// Server-computed, not trusted from the client — same
					// rationale as create() (3.1).
					const severity = this.determineSeverity(vital.vitalType, vital.value);
					return this.vitalHistoryModel.updateOne(
						{ clusterId: id, vitalType: vital.vitalType },
						{
							$set: { ...vital, severity, recordedAt, notes },
							$setOnInsert: {
								userId: vHistory.userId,
								patient: vHistory.patient,
								clusterId: id,
								createdBy: vHistory.createdBy,
							},
						},
						{ upsert: true },
					);
				}),
			);

			// Drop any reading whose vitalType is no longer present in the new set.
			const keptTypes = vitals.map((vital) => vital.vitalType);
			await this.vitalHistoryModel.deleteMany({
				clusterId: id,
				vitalType: { $nin: keptTypes },
			});
		} else {
			await this.vitalHistoryModel.updateMany({ clusterId: id }, { ...others });
		}

		return id;
	}

	async remove(id: string, personnelId: string) {
		const existing = await this.vitalHistoryModel.findOne({ clusterId: id });

		if (!existing) {
			throw new NotFoundException('Vital history not found');
		}

		if (existing.createdBy?.toString() !== personnelId) {
			throw new ForbiddenException(
				'Only the personnel who recorded this vital history can delete it',
			);
		}

		await this.vitalHistoryModel.deleteMany({ clusterId: id });
	}

	async fetchVitalHistory(userId: string) {
		// const { pageFilter } = generateFilter(query);

		const vitalHistories = await this.vitalHistoryModel.aggregate<VitalHistory>(
			[
				// 1. Match only this patient's vitals
				{
					$match: {
						userId,
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
					userId,
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
			userId,
		});

		return { rows: results, count };
	}

	async findVitalLogById(userId: string, id: string) {
		const results = await this.vitalHistoryModel.aggregate<
			Record<string, unknown>
		>([
			{
				$match: {
					_id: new Types.ObjectId(id),
					userId,
				},
			},
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

		if (!results.length) {
			throw new NotFoundException('Vital history log not found');
		}

		return results[0];
	}

	async updateVitalLog(
		userId: string,
		id: string,
		dto: UpdateVitalLogDto,
		personnelId: string,
	) {
		const $set: Record<string, unknown> = {};
		if (dto.severity !== undefined) $set.severity = dto.severity;
		if (dto.notes !== undefined) $set.notes = dto.notes;

		const result = await this.vitalHistoryModel.findOneAndUpdate(
			{
				_id: new Types.ObjectId(id),
				userId,
				// Only the personnel who recorded this reading may edit it.
				createdBy: new Types.ObjectId(personnelId),
			},
			{ $set },
			{ new: true },
		);

		if (!result) {
			throw new NotFoundException('Vital history log not found');
		}

		return result;
	}

	async fetchBPTrend(userId: string, query: BpTrendsQueryDto) {
		const { dateRange } = query;
		const { timestamp } = getDateRangeFilter(dateRange)!;

		const match = {
			userId,
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
			.select('value notes')
			.lean();

		let formattedVitalTrend = vitalTrend[0];

		if (!formattedVitalTrend) {
			return {
				labels: [],
				systolic: [],
				diastolic: [],
				latestValue: null,
				note: null,
			};
		}

		return {
			...formattedVitalTrend,
			latestValue: latest?.value ?? null,
			note: latest?.notes ?? null,
		};
	}

	async fetchVitalTrend(userId: string, query: VitalHistoryTrendsQueryDto) {
		const { vitalType, dateRange } = query;
		const { timestamp } = getDateRangeFilter(dateRange)!;

		const matchRecord: Record<string, any> = {
			vitalType,
			recordedAt: timestamp,
		};

		// if (query.vitalType === 'bloodSugar') {
		// 	matchRecord.vitalSubType = 'fastingBloodSugar';
		// }

		const vitalTrend = await this.vitalHistoryModel.aggregate([
			{
				$match: {
					userId,
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
				userId,
				...matchRecord,
			})
			.sort({ recordedAt: -1 })
			.select('value notes')
			.lean();

		let formattedVitalTrend = vitalTrend[0];

		if (!formattedVitalTrend) {
			return {
				labels: [],
				values: [],
				latestValue: null,
				note: null,
			};
		}

		return {
			...formattedVitalTrend,
			latestValue: latest ? Number(latest.value) : null,
			note: latest?.notes ?? null,
		};
	}

	async removeByUserId(userId: string) {
		return this.vitalHistoryModel.deleteMany({ userId });
	}

	async countVitalsBySeverity(
		userId: string,
		severity: VitalSeverityEnum | VitalSeverityEnum[],
	): Promise<number> {
		return this.vitalHistoryModel.countDocuments({
			userId,
			severity: Array.isArray(severity) ? { $in: severity } : severity,
		});
	}
}
