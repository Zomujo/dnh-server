import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';
import { flattenMeta } from '../../common/entities/base-dh.entity';
import { ConcernQueryFilter, CreateConcernDto, UpdateConcernDto } from './dto';
import { Concern } from './entities/concern.entity';

@Injectable()
export class ConcernsService {
	constructor(
		@InjectModel(Concern.name) private concernModel: Model<Concern>,
	) {}

	create(_createConcernDto: CreateConcernDto) {
		return 'This action adds a new concern';
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

		// 2. The "What" (Description array)
		if (concern.description && concern.description.length > 0) {
			parts.push(`Details: ${concern.description.join(', ')}.`);
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

	findAll() {
		return `This action returns all concerns`;
	}

	findOne(id: number) {
		return `This action returns a #${id} concern`;
	}

	update(id: number, _updateConcernDto: UpdateConcernDto) {
		return `This action updates a #${id} concern`;
	}

	remove(id: number) {
		return `This action removes a #${id} concern`;
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

	async removeByUserId(userId: string) {
		return this.concernModel.deleteMany({ userId });
	}
}
