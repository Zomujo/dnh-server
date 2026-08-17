import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { setHours, setMinutes, startOfDay } from 'date-fns';
import { Model, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';
import { AdherencesService } from '@/features/adherences/adherences.service';
import { TargetType } from '@/features/adherences/dto/target-type.enum';
import {
	type Frequency,
	NotificationChannel,
	NotificationPriority,
	NotificationTone,
	NotificationType,
	RepetitionType,
} from '@/features/notifications/dto/notification.dto';
import { NotificationsService } from '@/features/notifications/notifications.service';
import { flattenMeta } from '../../common/entities/base-dh.entity';
import { DhVectorsService } from '../dh-vectors/dh-vectors.service';
import { DHDocumentType } from '../dh-vectors/dto';
import {
	CreateMedicationDto,
	MedicationQueryFilter,
	UpdateMedicationDto,
	UpsertMedicationDto,
} from './dto';
import { Medication } from './entities/medication.entity';

@Injectable()
export class MedicationsService {
	constructor(
		@InjectModel(Medication.name) private medicationModel: Model<Medication>,
		private readonly dhVectorsService: DhVectorsService,
		private readonly adherencesService: AdherencesService,
		private readonly notificationsService: NotificationsService,
	) {}

	private buildScheduleTime(time: {
		hour: number;
		minutes: number;
		timeDesignators: 'AM' | 'PM';
	}): Date {
		let hours = time.hour;
		if (time.timeDesignators === 'PM' && hours !== 12) hours += 12;
		if (time.timeDesignators === 'AM' && hours === 12) hours = 0;
		return setHours(setMinutes(startOfDay(new Date()), time.minutes), hours);
	}

	async create(dto: CreateMedicationDto, userId: string, patient: string) {
		const schedules = (
			[
				['morning', dto.morning],
				['afternoon', dto.afternoon],
				['evening', dto.evening],
			] as const
		).filter(([, s]) => s) as [
			'morning' | 'afternoon' | 'evening',
			NonNullable<CreateMedicationDto['morning']>,
		][];

		for (const [, schedule] of schedules) {
			const notificationId = await this.notificationsService.create({
				notificationType: NotificationType.REMINDER,
				patient,
				userId,
				startDate: this.buildScheduleTime(schedule.time),
				tone: NotificationTone.FRIENDLY,
				targetType: TargetType.MEDICATION,
				characterLimit: 120,
				targetName: dto.name,
				channel: NotificationChannel.PUSH,
				goal: `Take ${dto.name}`,
				priority: NotificationPriority.HIGH,
				frequency: {
					repeatEvery: 1,
					repetitionType: RepetitionType.DAILY,
				},
				timezone: 'Africa/Accra',
			});
			(schedule as any).notification = notificationId.toString();
		}

		const firstSchedule = schedules[0]?.[1];
		const startDate = firstSchedule
			? this.buildScheduleTime(firstSchedule.time)
			: new Date();
		const repeatEvery = schedules.length || 1;

		const qdrantId = uuidv7();
		const medication = await this.medicationModel.create({
			userId,
			patient: patient as any,
			...(dto as any),
			startDate,
			frequency: { repeatEvery, repetitionType: RepetitionType.DAILY },
		});

		const summary = this.generateMedicationDescription(medication);
		await this.dhVectorsService.create({
			qdrantId,
			userId,
			patient,
			documentType: DHDocumentType.MEDICATION,
			documentId: medication._id.toString(),
			summary,
		});
		return medication._id.toString();
	}

	async upsertMedication(
		filters: Record<string, any>,
		dto: UpsertMedicationDto,
	) {
		const qdrantId = uuidv7();
		const searchMedication = await this.dhVectorsService.findAll({
			userId: filters.userId,
			patient: filters.patient,
			documentType: DHDocumentType.MEDICATION,
			query: filters.name.toLowerCase(),
		});

		const whereConditions: Record<string, any> = {};
		if (!searchMedication.length) {
			whereConditions.name = new RegExp(filters.name, 'i');
			whereConditions.patient = filters.patient;
		} else {
			whereConditions._id = new Types.ObjectId(
				searchMedication[0].item.documentId,
			);
		}

		const medication = await this.medicationModel.findOneAndUpdate(
			whereConditions,
			{
				$set: { ...dto },
				$setOnInsert: { qdrantId },
			},

			{ returnDocument: 'after', upsert: true },
		);
		const summary = this.generateMedicationDescription(medication);

		await this.dhVectorsService.create({
			qdrantId: medication.qdrantId,
			userId: filters.userId,
			patient: filters.patient,
			documentType: DHDocumentType.MEDICATION,
			documentId: medication._id.toString(),
			summary,
		});

		return medication._id;
	}

	private formatFrequency(freq: Frequency): string {
		const typeMap: Record<string, string> = {
			daily: 'day',
			weekly: 'week',
			monthly: 'month',
			yearly: 'year',
			hourly: 'hour',
		};
		const unit = typeMap[freq.repetitionType] || freq.repetitionType;
		return `every ${freq.repeatEvery} ${unit}${freq.repeatEvery > 1 ? 's' : ''}`;
	}

	private generateMedicationDescription(
		medication: Partial<Medication>,
	): string {
		const parts: string[] = [];

		if (medication.name) {
			parts.push(`Medication: ${medication.name}.`);
		}
		if (medication.purpose) {
			parts.push(`Purpose: Used for ${medication.purpose}.`);
		}

		if (medication.dosage || medication.frequency || medication.route) {
			const dosageInfo = [
				medication.dosage,
				medication.frequency
					? this.formatFrequency(medication.frequency)
					: null,
				medication.route ? `via ${medication.route} route` : null,
			]
				.filter(Boolean)
				.join(' ');
			parts.push(`Instructions: Take ${dosageInfo}.`);
		}

		if (medication.sideEffects?.length) {
			parts.push(
				`Known side effects include: ${medication.sideEffects.join(', ')}.`,
			);
		}

		if (medication.prescribedBy) {
			parts.push(`Prescribed by: ${medication.prescribedBy}.`);
		}

		if (medication.meta) {
			const flatMeta = flattenMeta(medication.meta);
			parts.push(`Additional clinical observations: ${flatMeta}`);
		}

		if (medication.createdAt && medication.updatedAt) {
			parts.push(
				`Medication Created At: ${new Date(medication.createdAt).toLocaleString()} and Updated At: ${new Date(medication.updatedAt).toLocaleString()}`,
			);
		}

		return parts.join(' ');
	}
	async findAllByQuery(filters: MedicationQueryFilter) {
		let query = this.medicationModel
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
		return `This action returns all medications`;
	}

	findOne(id: number) {
		return `This action returns a #${id} medication`;
	}

	async update(id: string, dto: UpdateMedicationDto, userId: string) {
		const medication = await this.medicationModel.findOne({ _id: id, userId });
		if (!medication) {
			throw new NotFoundException('Medication not found');
		}

		if (dto.dosage !== undefined) medication.dosage = dto.dosage;
		if (dto.notes !== undefined) medication.notes = dto.notes;

		const scheduleKeys = ['morning', 'afternoon', 'evening'] as const;
		const updatedSchedules: Array<{
			key: (typeof scheduleKeys)[number];
			schedule: NonNullable<UpdateMedicationDto['morning']>;
		}> = [];

		for (const key of scheduleKeys) {
			const dtoSchedule = dto[key];
			if (!dtoSchedule) continue;

			const existingSchedule = (medication as any)[key];

			if (existingSchedule?.notification) {
				await this.notificationsService.update(
					existingSchedule.notification.toString(),
					{
						startDate: this.buildScheduleTime(dtoSchedule.time),
					},
				);
			} else {
				const notificationId = await this.notificationsService.create({
					userId: medication.userId,
					notificationType: NotificationType.REMINDER,
					patient: medication.patient as any,
					startDate: this.buildScheduleTime(dtoSchedule.time),
					tone: NotificationTone.FRIENDLY,
					targetType: TargetType.MEDICATION,
					characterLimit: 120,
					targetName: medication.name,
					channel: NotificationChannel.PUSH,
					goal: `Take ${medication.name}`,
					priority: NotificationPriority.HIGH,
					frequency: {
						repeatEvery: 1,
						repetitionType: RepetitionType.DAILY,
					},
					timezone: 'Africa/Accra',
				});
				(dtoSchedule as any).notification = notificationId.toString();
			}

			updatedSchedules.push({ key, schedule: dtoSchedule });
		}

		if (updatedSchedules.length > 0) {
			medication.frequency = {
				repeatEvery: updatedSchedules.length,
				repetitionType: RepetitionType.DAILY,
			};
		}

		for (const { key, schedule } of updatedSchedules) {
			(medication as any)[key] = schedule;
		}

		await medication.save();

		const summary = this.generateMedicationDescription(medication);

		await this.dhVectorsService.create({
			qdrantId: medication.qdrantId,
			userId: medication.userId,
			patient: medication.patient as any,
			documentType: DHDocumentType.MEDICATION,
			documentId: medication._id.toString(),
			summary,
		});

		return medication._id.toString();
	}

	async remove(id: string, userId: string) {
		const medication = await this.medicationModel.findOne({ _id: id, userId });
		if (!medication) {
			throw new NotFoundException('Medication not found');
		}

		const schedules = ['morning', 'afternoon', 'evening'] as const;
		for (const section of schedules) {
			const schedule = (medication as any)[section] as
				| { notification?: any }
				| undefined;
			if (schedule?.notification) {
				try {
					await this.notificationsService.remove(
						schedule.notification.toString(),
					);
				} catch {
					// notification may already be deleted
				}
			}
		}

		await this.adherencesService.removeLogsByTargetName(
			medication.userId,
			medication.name,
		);
		await this.adherencesService.removePatternsByTargetName(
			medication.userId,
			medication.name,
		);

		await this.dhVectorsService.deleteByDocumentId(medication._id.toString());

		await this.medicationModel.findByIdAndDelete(id);
	}

	async findByUserId(userId: string, offset: number, limit: number) {
		return this.medicationModel
			.find({ userId })
			.skip(offset)
			.limit(limit)
			.sort({ createdAt: -1 })
			.select([
				'name',
				'quantity',
				'quantityUnit',
				'refillReminder',
				'dosage',
				'frequency',
				'prescribedBy',
			]);
	}

	async findById(id: string) {
		const medication = await this.medicationModel.findById(id);
		if (!medication) {
			throw new NotFoundException('Medication not found');
		}
		return medication;
	}

	async findAllByUserId(userId: string) {
		return this.medicationModel
			.find({ userId })
			.select(['name', 'dosage', 'purpose', 'startDate', 'frequency'])
			.lean();
	}

	async findBySchedule(
		userId: string,
		section: 'morning' | 'afternoon' | 'evening',
	) {
		return this.medicationModel
			.find({ userId, [section]: { $exists: true, $ne: null } })
			.select([
				'_id',
				'name',
				'dosage',
				'purpose',
				'morning',
				'afternoon',
				'evening',
			])
			.lean();
	}

	async countBySchedules(userId: string) {
		const result = await this.medicationModel.aggregate([
			{ $match: { userId } },
			{
				$group: {
					_id: null,
					morning: {
						$sum: { $cond: [{ $ifNull: ['$morning', false] }, 1, 0] },
					},
					afternoon: {
						$sum: { $cond: [{ $ifNull: ['$afternoon', false] }, 1, 0] },
					},
					evening: {
						$sum: { $cond: [{ $ifNull: ['$evening', false] }, 1, 0] },
					},
				},
			},
		]);
		delete result[0]._id;
		return result[0] ?? { morning: 0, afternoon: 0, evening: 0 };
	}

	async countByUserId(userId: string): Promise<number> {
		return this.medicationModel.countDocuments({ userId });
	}

	async removeByUserId(userId: string) {
		return this.medicationModel.deleteMany({ userId });
	}
}
