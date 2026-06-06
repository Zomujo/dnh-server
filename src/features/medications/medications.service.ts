import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';
import { AdherencesService } from '@/features/adherences/adherences.service';
import { TargetType } from '@/features/adherences/dto/target-type.enum';
import { UpdateAdherenceLogQueryDto } from '@/features/adherences/dto/update.dto';
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

	private generateMedicationDescription(
		medication: Partial<Medication>,
	): string {
		const parts: string[] = [];

		// 1. Identity & Purpose (The "What" and "Why")
		if (medication.name) {
			parts.push(`Medication: ${medication.name}.`);
		}
		if (medication.purpose) {
			parts.push(`Purpose: Used for ${medication.purpose}.`);
		}

		// 2. Instructions (The "How")
		if (medication.dosage || medication.frequency || medication.route) {
			const dosageInfo = [
				medication.dosage,
				medication.frequency,
				medication.route ? `via ${medication.route} route` : null,
			]
				.filter(Boolean)
				.join(' ');
			parts.push(`Instructions: Take ${dosageInfo}.`);
		}

		// 3. Clinical Context (Side Effects & Description)
		if (medication.sideEffects?.length) {
			parts.push(
				`Known side effects include: ${medication.sideEffects.join(', ')}.`,
			);
		}

		// 4. Logistics (Prescriber & Quantity)
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

		// Combine into a single paragraph
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

	async findMedicationsWithAdherence(
		userId: string,
		offset: number,
		limit: number,
	) {
		const medications = await this.findByUserId(userId, offset, limit);

		const populatedMedications = await Promise.all(
			medications.map(async (medication) => {
				const jsonMedication = medication.toJSON();
				const aLogs = await this.adherencesService.findAdherenceLogsByTarget(
					userId,
					TargetType.MEDICATION,
					medication.name,
					14,
				);

				const adherenceLogs = aLogs.map((log) => log.toJSON());
				return {
					...jsonMedication,
					lastTaken: adherenceLogs[0]?.takenAt || null,
					adherenceLogs,
				};
			}),
		);

		return populatedMedications;
	}

	async countByUserId(userId: string): Promise<number> {
		return this.medicationModel.countDocuments({ userId });
	}

	async removeByUserId(userId: string) {
		return this.medicationModel.deleteMany({ userId });
	}
}
