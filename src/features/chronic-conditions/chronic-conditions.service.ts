import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';
import { flattenMeta } from '../../common/entities/base-dh.entity';
import { Patient } from '../../features/patients/entities/patient.entity';
import { DhVectorsService } from '../dh-vectors/dh-vectors.service';
import { DHDocumentType } from '../dh-vectors/dto';
import {
	ChronicConditionQueryFilter,
	CreateChronicConditionDto,
	UpdateChronicConditionDto,
} from './dto';
import { ChronicCondition } from './entities/chronic-condition.entity';

@Injectable()
export class ChronicConditionsService {
	constructor(
		@InjectModel(ChronicCondition.name)
		private chronicConditionModel: Model<ChronicCondition>,
		@InjectModel(Patient.name)
		private patientModel: Model<Patient>,
		private readonly dhVectorsService: DhVectorsService,
	) {}

	create(_createChronicConditionDto: CreateChronicConditionDto) {
		return 'This action adds a new chronicCondition';
	}

	async upsertChronicCondition(
		filters: Record<string, any>,
		dto: CreateChronicConditionDto,
	) {
		const qdrantId = uuidv7();

		const searchMedication = await this.dhVectorsService.findAll({
			userId: filters.userId,
			patient: filters.patient,
			documentType: DHDocumentType.CHRONIC_CONDITION,
			query: filters.conditionName.toLowerCase(),
		});

		const whereConditions: Record<string, any> = {};
		if (!searchMedication.length) {
			whereConditions.userId = filters.userId;
			whereConditions.patient = filters.patient;
			if (filters.conditionName) {
				whereConditions.conditionName = new RegExp(filters.conditionName, 'i');
			}
		} else {
			whereConditions._id = new Types.ObjectId(
				searchMedication[0].item.documentId,
			);
		}

		const chronicCondition = await this.chronicConditionModel.findOneAndUpdate(
			whereConditions,
			{
				$set: { ...dto },
				$setOnInsert: { qdrantId },
			},
			{ returnDocument: 'after', upsert: true },
		);

		await this.patientModel.findByIdAndUpdate(filters.patient, {
			$addToSet: {
				chronicConditions: chronicCondition.conditionName.toLowerCase(),
			},
		});

		const summary = this.generateChronicConditionSummary(chronicCondition);

		await this.dhVectorsService.create({
			qdrantId: chronicCondition.qdrantId,
			userId: filters.userId,
			patient: filters.patient,
			documentType: DHDocumentType.CHRONIC_CONDITION,
			documentId: chronicCondition._id.toString(),
			summary,
		});

		return chronicCondition._id;
	}

	private generateChronicConditionSummary(
		condition: Partial<ChronicCondition>,
	): string {
		const parts: string[] = [];

		// 1. Diagnosis & Duration
		if (condition.conditionName) {
			const year = condition.diagnosedDate?.year;
			const dateStr = year ? ` diagnosed in ${year}` : '';
			parts.push(`Chronic Condition: ${condition.conditionName}${dateStr}.`);
		}

		// 2. Clinical Status & Severity
		if (condition.currentStatus || condition.severity) {
			const status = condition.currentStatus || 'unknown status';
			const severity = condition.severity
				? `, classified as ${condition.severity}`
				: '';
			parts.push(`Current Management: The condition is ${status}${severity}.`);
		}

		// 3. Healthcare Provider Context
		if (condition.diagnosedBy) {
			parts.push(`Original diagnosis provided by ${condition.diagnosedBy}.`);
		}

		// 4. Qualitative Context (The "Human" side)
		if (condition.notes) {
			parts.push(
				`Additional notes on condition progression: ${condition.notes}`,
			);
		}

		if (condition.meta) {
			const flatMeta = flattenMeta(condition.meta);
			parts.push(`Additional clinical observations: ${flatMeta}`);
		}

		if (condition.createdAt && condition.updatedAt) {
			parts.push(
				`Chronic Condition Created At: ${new Date(condition.createdAt).toLocaleString()} and Updated At: ${new Date(condition.updatedAt).toLocaleString()}`,
			);
		}

		return parts.join(' ');
	}

	async findAllByQuery(filters: ChronicConditionQueryFilter) {
		let query = this.chronicConditionModel
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
		return `This action returns all chronicConditions`;
	}

	findOne(id: number) {
		return `This action returns a #${id} chronicCondition`;
	}

	update(id: number, _updateChronicConditionDto: UpdateChronicConditionDto) {
		return `This action updates a #${id} chronicCondition`;
	}

	remove(id: number) {
		return `This action removes a #${id} chronicCondition`;
	}

	async findByUserId(userId: string, offset: number, limit: number) {
		const conditions = await this.chronicConditionModel
			.find({ userId })
			.skip(offset)
			.limit(limit)
			.sort({ diagnosedDate: -1 })
			.select('conditionName diagnosedBy diagnosedDate currentStatus');

		return conditions;
	}

	async countByUserId(userId: string): Promise<number> {
		return this.chronicConditionModel.countDocuments({ userId });
	}

	async removeByUserId(userId: string) {
		return this.chronicConditionModel.deleteMany({ userId });
	}
}
