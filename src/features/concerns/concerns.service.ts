import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';
import { generateFilter } from '@/common/factory';
import { flattenMeta } from '../../common/entities/base-dh.entity';
import { PatientsService } from '../patients/patients.service';
import {
	AddSymptomsDto,
	ConcernQueryFilter,
	CreateConcernDto,
	GetSymptomsQueryDto,
	UpdateConcernDto,
} from './dto';
import { Concern, ConcernTypeEnum } from './entities/concern.entity';

@Injectable()
export class ConcernsService {
	constructor(
		@InjectModel(Concern.name) private concernModel: Model<Concern>,
		private readonly patientsService: PatientsService,
	) {}

	async create(userId: string, addSymptomsDto: AddSymptomsDto) {
		const patient = await this.patientsService.findPatientByUserId(
			userId,
			'_id facility',
		);
		if (!patient) {
			throw new NotFoundException('Patient record not found');
		}

		const symptom = await this.concernModel.create({
			userId,
			patient: patient._id,
			host: patient.facility as any,
			concernType: ConcernTypeEnum.SYMPTOMS,
			onsetDate: addSymptomsDto.onsetDate ?? new Date(),
			description: addSymptomsDto.description,
		});

		return symptom._id;
	}

	async upsertConcern(filters: Record<string, any>, dto: CreateConcernDto) {
		const qdrantId = uuidv7();

		const concern = await this.concernModel.findOneAndUpdate(
			filters,
			{
				$set: { ...dto },
				$setOnInsert: { qdrantId },
			},
			{
				returnDocument: 'after',
				upsert: true,
			},
		);
		// const summary = this.generateConcernSummary(concern);
		//
		// await this.dhVectorsService.create({
		// 	qdrantId: concern.qdrantId,
		// 	userId: filters.userId,
		// 	patient: filters.patient,
		// 	documentType: DHDocumentType.CONCERN,
		// 	documentId: concern._id.toString(),
		// 	summary,
		// });

		return concern._id;
	}

	private generateConcernSummary(concern: Partial<Concern>): string {
		const parts: string[] = [];

		// 1. Core Concern & Type
		// Map 'side_effect' to 'side effect' for better semantic matching
		const typeLabel =
			concern.concernType?.replace(/_/g, ' ') || 'health concern';
		parts.push(`Patient reported a ${typeLabel}.`);

		// 2. The "What" (Description array or string)
		if (concern.description) {
			const descText = Array.isArray(concern.description)
				? concern.description.join(', ')
				: concern.description;
			if (descText) {
				parts.push(`Details: ${descText}.`);
			}
		}

		// 3. Severity & Status (The Urgency)
		if (concern.severity) {
			parts.push(`The severity is rated as ${concern.severity}.`);
		}

		const status = concern.resolved
			? 'This issue is now resolved.'
			: 'This is an active and ongoing concern.';
		parts.push(status);

		// 4. Temporal Context
		if (concern.onsetDate) {
			const onsetStr = new Date(concern.onsetDate).toLocaleDateString();
			parts.push(`This concern started on ${onsetStr}.`);
		}

		// 5. Contextual Notes
		if (concern.notes) {
			parts.push(`Additional context: ${concern.notes}`);
		}

		if (concern.meta) {
			const flatMeta = flattenMeta(concern.meta);
			parts.push(`Additional clinical observations: ${flatMeta}`);
		}

		if (concern.createdAt && concern.updatedAt) {
			parts.push(
				`Concern Created At: ${new Date(concern.createdAt).toLocaleString()} and Updated At: ${new Date(concern.updatedAt).toLocaleString()}`,
			);
		}

		return parts.join(' ');
	}

	async findAllByQuery(filters: ConcernQueryFilter) {
		let query = this.concernModel
			.find(filters.query)
			.limit(filters.limit ?? 10)
			.sort({ createdAt: -1 });

		if (filters.projection) {
			query = query.select(filters.projection);
		}

		const results = await query.lean();

		return results;
	}

	async findSymptomById(id: string, userId: string) {
		const symptom = await this.concernModel
			.findOne({ _id: id, userId, concernType: ConcernTypeEnum.SYMPTOMS })
			.select('description onsetDate');
		if (!symptom) {
			throw new NotFoundException('Symptom not found');
		}
		return symptom;
	}

	async updateSymptom(id: string, userId: string, dto: UpdateConcernDto) {
		const symptom = await this.concernModel.findOneAndUpdate(
			{ _id: id, userId, concernType: ConcernTypeEnum.SYMPTOMS },
			{ $set: dto },
			{ new: true },
		);
		if (!symptom) {
			throw new NotFoundException('Symptom not found');
		}
		return symptom._id.toString();
	}

	async deleteSymptom(id: string, userId: string) {
		const symptom = await this.concernModel.findOneAndDelete({
			_id: id,
			userId,
			concernType: ConcernTypeEnum.SYMPTOMS,
		});
		if (!symptom) {
			throw new NotFoundException('Symptom not found');
		}
		return symptom;
	}

	async findByUserId(userId: string, offset: number, limit: number) {
		return this.concernModel
			.find({ userId })
			.skip(offset)
			.limit(limit)
			.sort({ updatedAt: -1 })
			.select([
				'concernType',
				'concernName',
				'description',
				'onsetDate',
				'resolved',
			]);
	}

	async countByUserId(userId: string): Promise<number> {
		return this.concernModel.countDocuments({ userId });
	}

	async fetchSymptoms(userId: string, query: GetSymptomsQueryDto) {
		const filter = { userId, concernType: ConcernTypeEnum.SYMPTOMS };
		const pageFilter = generateFilter(query).pageFilter;

		const [rows, count] = await Promise.all([
			this.concernModel
				.find(filter)
				.select('description onsetDate')
				.skip(pageFilter.offset)
				.limit(pageFilter.limit)
				.sort(pageFilter.orderBy),
			this.concernModel.countDocuments(filter),
		]);

		return { rows, count };
	}

	async removeByUserId(userId: string) {
		return this.concernModel.deleteMany({ userId });
	}

	async findAllSymptomsForFacility(
		facilityId: string,
		patientId: string,
		query: GetSymptomsQueryDto,
	) {
		const filter = {
			host: new Types.ObjectId(facilityId),
			patient: new Types.ObjectId(patientId),
			concernType: ConcernTypeEnum.SYMPTOMS,
		};
		const pageFilter = generateFilter(query).pageFilter;

		const [rows, count] = await Promise.all([
			this.concernModel
				.find(filter)
				.select('description onsetDate')
				.skip(pageFilter.offset)
				.limit(pageFilter.limit)
				.sort(pageFilter.orderBy),
			this.concernModel.countDocuments(filter),
		]);

		return { rows, count };
	}

	async findSymptomForFacility(
		facilityId: string,
		patientId: string,
		id: string,
	) {
		const symptom = await this.concernModel
			.findOne({
				_id: id,
				host: new Types.ObjectId(facilityId),
				patient: new Types.ObjectId(patientId),
				concernType: ConcernTypeEnum.SYMPTOMS,
			})
			.select('description onsetDate');
		if (!symptom) {
			throw new NotFoundException('Symptom not found');
		}
		return symptom;
	}

	async updateSymptomForFacility(
		facilityId: string,
		patientId: string,
		id: string,
		dto: UpdateConcernDto,
	) {
		const symptom = await this.concernModel.findOneAndUpdate(
			{
				_id: id,
				host: new Types.ObjectId(facilityId),
				patient: new Types.ObjectId(patientId),
				concernType: ConcernTypeEnum.SYMPTOMS,
			},
			{ $set: dto },
			{ new: true },
		);
		if (!symptom) {
			throw new NotFoundException('Symptom not found');
		}
		return symptom;
	}

	async deleteSymptomForFacility(
		facilityId: string,
		patientId: string,
		id: string,
	) {
		const symptom = await this.concernModel.findOneAndDelete({
			_id: id,
			host: new Types.ObjectId(facilityId),
			patient: new Types.ObjectId(patientId),
			concernType: ConcernTypeEnum.SYMPTOMS,
		});
		if (!symptom) {
			throw new NotFoundException('Symptom not found');
		}
		return symptom;
	}

	async resolveSymptomForFacility(
		facilityId: string,
		patientId: string,
		id: string,
	) {
		const symptom = await this.concernModel.findOneAndUpdate(
			{
				_id: id,
				host: new Types.ObjectId(facilityId),
				patient: new Types.ObjectId(patientId),
				concernType: ConcernTypeEnum.SYMPTOMS,
			},
			{ $set: { resolved: true } },
			{ new: true },
		);
		if (!symptom) {
			throw new NotFoundException('Symptom not found');
		}
		return symptom;
	}
}
