import { TaskType } from '@google/generative-ai';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import {
	Inject,
	Injectable,
	Logger,
	OnModuleInit,
	Optional,
	ValidationError,
} from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import Fuse from 'fuse.js';
import { v7 as uuidv7 } from 'uuid';
import { isVectorStoreConfigured } from '@/common/utils/ai-features';
import {
	CreateDhVectorDto,
	GetDhVectorDto,
	QueryDhVectorsDto,
	UpdateDhVectorDto,
} from './dto';

export const QDRANT_CLIENT = 'QDRANT_CLIENT';
const COLLECTION = 'dh_vectors';
/** How long startup waits on Qdrant before marking the store unavailable. */
const INIT_TIMEOUT_MS = 10_000;
/** After a failed setup, how long until an operation tries setup again. */
const INIT_RETRY_MS = 60_000;

type StoreState = 'disabled' | 'pending' | 'ready' | 'unavailable';

/**
 * The Qdrant vector store behind the AI's semantic search. The AI is
 * retired, so the store is optional: with no Qdrant (or no Gemini for the
 * embeddings) configured, writes are no-ops and searches find nothing. A
 * configured but unreachable Qdrant never holds up or fails startup; the
 * store is marked unavailable and setup is retried on a later call.
 */
@Injectable()
export class DhVectorsService implements OnModuleInit {
	private embeddings?: GoogleGenerativeAIEmbeddings;
	private logger = new Logger(DhVectorsService.name);
	private state: StoreState;
	private setup?: Promise<void>;
	private lastSetupAt = 0;

	constructor(
		@Optional()
		@Inject(QDRANT_CLIENT)
		private readonly qdrant: QdrantClient | null,
	) {
		this.state =
			this.qdrant && isVectorStoreConfigured() ? 'pending' : 'disabled';
		if (this.state !== 'disabled') {
			this.embeddings = new GoogleGenerativeAIEmbeddings({
				model: 'gemini-embedding-001', // 3072 dimensions
				taskType: TaskType.RETRIEVAL_DOCUMENT,
			});
		}
	}

	/** The store is configured and set up; false skips the operation. */
	private async isAvailable(): Promise<boolean> {
		if (this.state === 'disabled') return false;
		const retryDue =
			this.state === 'unavailable' &&
			Date.now() - this.lastSetupAt >= INIT_RETRY_MS;
		if (retryDue || (this.state === 'pending' && !this.setup)) {
			this.startSetup();
		}
		if (this.state === 'pending') await this.setup;
		return this.state === 'ready';
	}

	private get store(): {
		qdrant: QdrantClient;
		embeddings: GoogleGenerativeAIEmbeddings;
	} {
		return { qdrant: this.qdrant!, embeddings: this.embeddings! };
	}

	async create(dto: CreateDhVectorDto) {
		if (!(await this.isAvailable())) return undefined;
		const { qdrant, embeddings } = this.store;
		try {
			const vector = await embeddings.embedQuery(dto.summary);

			// const dhVector = await this.dhVectorModel.create({
			// 	...dto,
			// 	projectEmbedding: vector,
			// });
			await this.validateVectorDto(CreateDhVectorDto, dto);
			const dhVector = await qdrant.upsert(COLLECTION, {
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

	/**
	 * Indexes a record for the AI's semantic search. Best-effort: the index
	 * is secondary to MongoDB, so an embedding outage (e.g. Gemini billing)
	 * must not fail the write that triggered it. create() logs the error.
	 */
	async index(dto: CreateDhVectorDto): Promise<void> {
		try {
			await this.create(dto);
		} catch {
			// Logged in create(); the record is saved, only unsearchable.
		}
	}

	/**
	 * findAll(), but an outage yields no matches, so callers fall back to
	 * their exact-match lookup instead of failing.
	 */
	async findSimilar(dto: QueryDhVectorsDto) {
		try {
			return await this.findAll(dto);
		} catch (error) {
			this.logger.error('Error searching dh vectors', error);
			return [];
		}
	}

	async bulkCreate(dto: CreateDhVectorDto[]) {
		if (!(await this.isAvailable())) return;
		const { qdrant, embeddings } = this.store;
		const summaries = dto.map((d) => d.summary);
		const vector = await embeddings.embedDocuments(summaries);

		const dhVectors = dto.map((d, i) => {
			return {
				id: uuidv7(),
				vector: vector[i],
				payload: { ...d },
			};
		});

		await qdrant.upsert(COLLECTION, { wait: true, points: dhVectors });
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
		if (!(await this.isAvailable())) return [];
		await this.validateVectorDto(GetDhVectorDto, filter);
		const { points } = await this.store.qdrant.query(COLLECTION, {
			query: vector,
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
		return points;
	}

	async deleteByDocumentId(documentId: string) {
		if (!(await this.isAvailable())) return;
		try {
			await this.store.qdrant.delete(COLLECTION, {
				filter: {
					must: [{ key: 'documentId', match: { value: documentId } }],
				},
			});
		} catch (e) {
			this.logger.error('Error deleting dh vector by documentId', e);
		}
	}

	async cleanOrphans(userId: string) {
		if (!(await this.isAvailable())) return;
		try {
			await this.store.qdrant.delete(COLLECTION, {
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
		if (!(await this.isAvailable())) return [];
		const vector = await this.store.embeddings.embedQuery(dto.query);
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
		const collectionName = COLLECTION;
		const qdrant = this.store.qdrant;
		const info = await qdrant.getCollection(collectionName);
		const existingIndexes = Object.keys(info.payload_schema || {});

		const fieldsToIndex = ['userId', 'patient', 'documentType', 'documentId'];

		for (const field of fieldsToIndex) {
			try {
				this.logger.log(`Ensuring index for ${field}...`);
				if (!existingIndexes.includes(field)) {
					await qdrant.createPayloadIndex(collectionName, {
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

	onModuleInit() {
		if (this.state === 'disabled') {
			this.logger.log(
				'Vector store disabled: Qdrant or Gemini is not configured.',
			);
			return;
		}
		// Not awaited: an unreachable Qdrant must not hold up startup.
		this.startSetup();
	}

	private startSetup() {
		this.state = 'pending';
		this.lastSetupAt = Date.now();
		this.setup = withTimeout(this.ensureCollection(), INIT_TIMEOUT_MS).then(
			() => {
				this.state = 'ready';
			},
			(error) => {
				this.state = 'unavailable';
				const message = error instanceof Error ? error.message : String(error);
				this.logger.warn(
					`Vector store unavailable, semantic search is off: ${message}`,
				);
			},
		);
	}

	private async ensureCollection() {
		const qdrant = this.store.qdrant;
		const collections = await qdrant.getCollections();
		const exists = collections.collections.some((c) => c.name === COLLECTION);

		let logText = '✅ Vector DB Already Exists';
		if (!exists) {
			await qdrant.createCollection(COLLECTION, {
				vectors: { size: 3072, distance: 'Cosine' },
			});
			logText = '✅ Vector DB Created successfully';
		}
		await this.ensureIndexes();
		this.logger.log(logText);
	}
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	let timer: NodeJS.Timeout | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() => reject(new Error(`no response from Qdrant within ${ms}ms`)),
			ms,
		);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
