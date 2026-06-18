import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';
import { AdherencesService } from '@/features/adherences/adherences.service';
import { UpdateAdherenceLogQueryDto } from '@/features/adherences/dto/update.dto';
import type { Frequency } from '@/features/notifications/dto/notification.dto';
import { flattenMeta } from '../../common/entities/base-dh.entity';
import { DhVectorsService } from '../dh-vectors/dh-vectors.service';
import { DHDocumentType } from '../dh-vectors/dto';
import {
	CreateMedicationDto,
	MedicationNotificationChoiceDto,
	MedicationQueryFilter,
	UpdateMedicationDto,
} from './dto';
import { Medication } from './entities/medication.entity';

@Injectable()
export class MedicationsService {
	constructor(
		@InjectModel(Medication.name) private medicationModel: Model<Medication>,
		private readonly dhVectorsService: DhVectorsService,
		private readonly adherencesService: AdherencesService,
	) {}

	create(_createMedicationDto: CreateMedicationDto) {
		return 'This action adds a new medication';
	}

	async upsertMedication(
		filters: Record<string, any>,
		dto: CreateMedicationDto,
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

	async receiveChoice(
		userId: string,
		dto: MedicationNotificationChoiceDto,
		query: UpdateAdherenceLogQueryDto,
	) {
		if (dto.choice === 'yes') {
			await this.adherencesService.updateManyAdherenceLogs(
				{ _id: { $in: query.id } },
				{ $set: { taken: true, takenAt: new Date(), status: 'taken' } },
			);
		}
		return `The user of ${userId} selected choice ${dto.choice}`;
	}

	update(id: number, _updateMedicationDto: UpdateMedicationDto) {
		return `This action updates a #${id} medication`;
	}

	remove(id: number) {
		return `This action removes a #${id} medication`;
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

	async countByUserId(userId: string): Promise<number> {
		return this.medicationModel.countDocuments({ userId });
	}

	async removeByUserId(userId: string) {
		return this.medicationModel.deleteMany({ userId });
	}
}
