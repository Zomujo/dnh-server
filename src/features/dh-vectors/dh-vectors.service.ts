import { TaskType } from '@google/generative-ai';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import {
	Inject,
	Injectable,
	Logger,
	OnModuleInit,
	ValidationError,
} from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import Fuse from 'fuse.js';
import { v7 as uuidv7 } from 'uuid';
import {
	CreateDhVectorDto,
	GetDhVectorDto,
	QueryDhVectorsDto,
	UpdateDhVectorDto,
} from './dto';

@Injectable()
export class DhVectorsService implements OnModuleInit {
	private embeddings: GoogleGenerativeAIEmbeddings;
	private logger = new Logger(DhVectorsService.name);
	constructor(@Inject('QDRANT_CLIENT') private readonly qdrant: QdrantClient) {
		this.embeddings = new GoogleGenerativeAIEmbeddings({
			model: 'gemini-embedding-001', // 3072 dimensions
			taskType: TaskType.RETRIEVAL_DOCUMENT,
		});
	}
	async create(dto: CreateDhVectorDto) {
		try {
			const vector = await this.embeddings.embedQuery(dto.summary);

			// const dhVector = await this.dhVectorModel.create({
			// 	...dto,
			// 	projectEmbedding: vector,
			// });
			await this.validateVectorDto(CreateDhVectorDto, dto);
			const dhVector = await this.qdrant.upsert('dh_vectors', {
				wait: true,
				points: [
					{
						id: dto.qdrantId ?? uuidv7(),
						vector: vector,
						payload: { ...dto },
					},
				],
			});
			return dhVector.status;
		} catch (error) {
			this.logger.error('Error creating dh vector', error);
			throw error;
		}
	}

	async bulkCreate(dto: CreateDhVectorDto[]) {
		const summaries = dto.map((d) => d.summary);
		const vector = await this.embeddings.embedDocuments(summaries);

		const dhVectors = dto.map((d, i) => {
			return {
				id: uuidv7(),
				vector: vector[i],
				payload: { ...d },
			};
		});

		await this.qdrant.upsert('dh_vectors', { wait: true, points: dhVectors });
	}

	async validateVectorDto<T extends object>(cls: ClassConstructor<T>, dto: T) {
		const vectorInstance = plainToInstance(cls, dto);

		// 2. Validate the instance
		const errors: ValidationError[] = await validate(vectorInstance, {
			whitelist: true,
			forbidNonWhitelisted: true,
			skipMissingProperties: false,
		});

		if (errors.length > 0) {
			const message = errors
				.map((error) => Object.values(error.constraints || {}).join(', '))
				.join('; ');

			throw new Error(`Validation failed: ${message}`);
		}

		return vectorInstance;
	}

	async search(vector: number[], filter: GetDhVectorDto, limit = 10) {
		await this.validateVectorDto(GetDhVectorDto, filter);
		return this.qdrant.search('dh_vectors', {
			vector: vector,
			filter: {
				must: [
					{ key: 'userId', match: { value: filter.userId } },
					{ key: 'patient', match: { value: filter.patient } },
					{ key: 'documentType', match: { value: filter.documentType } },
				],
			},
			limit: limit,
			with_payload: true,
		});
	}

	async cleanOrphans(userId: string) {
		try {
			await this.qdrant.delete('dh_vectors', {
				filter: {
					must: [{ key: 'userId', match: { value: userId } }],
				},
			});
		} catch (e) {
			console.error('clean cleanOrphans error', e);
			throw e;
		}
	}

	async findAll(dto: QueryDhVectorsDto) {
		const vector = await this.embeddings.embedQuery(dto.query);
		const filter: GetDhVectorDto = {
			userId: dto.userId,
			patient: dto.patient,
			documentType: dto.documentType,
		};
		const searchResults = await this.search(vector, filter);
		const payloadData = searchResults.map(
			(r) => r.payload as unknown as CreateDhVectorDto,
		);
		const fuse = new Fuse(payloadData, {
			keys: ['summary'],
			threshold: 0.3,
		});

		const fuseResults = fuse.search(dto.query);
		if (!fuseResults.length) {
			return [];
		}
		return fuseResults;
	}

	findOne(id: number) {
		return `This action returns a #${id} dhVector`;
	}

	update(id: number, updateDhVectorDto: UpdateDhVectorDto) {
		return `This action updates a #${id} dhVector`;
	}

	remove(id: number) {
		return `This action removes a #${id} dhVector`;
	}

	async ensureIndexes() {
		const collectionName = 'dh_vectors';
		const info = await this.qdrant.getCollection(collectionName);
		const existingIndexes = Object.keys(info.payload_schema || {});

		const fieldsToIndex = ['userId', 'patient', 'documentType'];

		for (const field of fieldsToIndex) {
			try {
				this.logger.log(`Ensuring index for ${field}...`);
				if (!existingIndexes.includes(field)) {
					await this.qdrant.createPayloadIndex(collectionName, {
						field_name: field,
						field_schema: 'keyword',
						wait: true,
					});
					this.logger.log(`Successfully indexed ${field}`);
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				this.logger.warn(
					`Index for ${field} already exists or failed: ${message}`,
				);
			}
		}
	}

	async onModuleInit() {
		// Ensure the collection exists on startup
		const collections = await this.qdrant.getCollections();
		const exists = collections.collections.some((c) => c.name === 'dh_vectors');

		let logText = '✅ Vector DB Already Exists';
		if (!exists) {
			await this.qdrant.createCollection('dh_vectors', {
				vectors: { size: 3072, distance: 'Cosine' },
			});
			logText = '✅ Vector DB Created successfully';
		}
		await this.ensureIndexes();
		this.logger.log(logText);
	}
}
