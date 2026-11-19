import type { QdrantClient } from '@qdrant/js-client-rest';
import { type Mocked, TestBed } from '@suites/unit';
import { Types } from 'mongoose';
import { mockDeep } from 'vitest-mock-extended';
import { DhVectorsService } from './dh-vectors.service';
import { DHDocumentType } from './dto';

describe('DhVectorsService', () => {
	let service: DhVectorsService;
	let qdrantClient: Mocked<QdrantClient>;

	beforeAll(async () => {
		// Configured store: a key and URL are set (no network is used).
		vi.stubEnv('GOOGLE_API_KEY', 'test-key');
		vi.stubEnv('QDRANT_URL', 'http://qdrant.test:6333');
		const { unit, unitRef } =
			await TestBed.solitary(DhVectorsService).compile();

		service = unit;
		qdrantClient = unitRef.get('QDRANT_CLIENT');
		qdrantClient.getCollections.mockResolvedValue({
			collections: [{ name: 'dh_vectors' }],
		} as any);
		qdrantClient.getCollection.mockResolvedValue({
			payload_schema: {
				userId: {},
				patient: {},
				documentType: {},
				documentId: {},
			},
		} as any);
		service.onModuleInit();
		await service.whenSetUp();
	});

	afterAll(() => {
		vi.unstubAllEnvs();
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	describe('create', () => {
		it('should validate dto and upsert vector embedding into qdrant', async () => {
			qdrantClient.upsert.mockResolvedValue({ status: 'completed' } as any);

			vi.spyOn((service as any).embeddings, 'embedQuery').mockResolvedValue(
				new Array(3072).fill(0.1),
			);

			const patientId = new Types.ObjectId().toString();
			const dto = {
				userId: 'u1',
				patient: patientId,
				documentType: DHDocumentType.MEDICATION,
				documentId: 'doc-123',
				summary: 'Take Metformin 500mg daily',
			};

			const status = await service.create(dto as any);

			expect((service as any).embeddings.embedQuery).toHaveBeenCalledWith(
				dto.summary,
			);
			expect(qdrantClient.upsert).toHaveBeenCalledWith(
				'dh_vectors',
				expect.objectContaining({
					wait: true,
					points: expect.arrayContaining([
						expect.objectContaining({
							payload: dto,
						}),
					]),
				}),
			);
			expect(status).toBe('completed');
		});

		it('should throw error when dto validation fails', async () => {
			const invalidDto = {
				userId: 'u1',
				// missing required patient and documentType fields
			};

			await expect(service.create(invalidDto as any)).rejects.toThrow();
		});
	});

	describe('index', () => {
		it('should resolve when embedding fails, so the write carries on', async () => {
			vi.spyOn((service as any).embeddings, 'embedQuery').mockRejectedValue(
				new Error('402 Payment Required'),
			);

			await expect(
				service.index({
					userId: 'u1',
					patient: new Types.ObjectId().toString(),
					documentType: DHDocumentType.MEDICATION,
					documentId: 'doc-123',
					summary: 'Take Metformin 500mg daily',
				} as any),
			).resolves.toBeUndefined();
			expect(qdrantClient.upsert).not.toHaveBeenCalled();
		});
	});

	describe('findSimilar', () => {
		it('should return no matches when embedding fails', async () => {
			vi.spyOn((service as any).embeddings, 'embedQuery').mockRejectedValue(
				new Error('402 Payment Required'),
			);

			const results = await service.findSimilar({
				userId: 'u1',
				patient: new Types.ObjectId().toString(),
				documentType: DHDocumentType.MEDICATION,
				query: 'metformin',
			});

			expect(results).toEqual([]);
			expect(qdrantClient.query).not.toHaveBeenCalled();
		});
	});

	describe('search', () => {
		it('should search qdrant with filtered vector query', async () => {
			qdrantClient.query.mockResolvedValue({
				points: [{ id: 'vec-1', payload: { summary: 'Metformin' } }],
			} as any);

			const vector = [0.1, 0.2];
			const patientId = new Types.ObjectId().toString();
			const filter = {
				userId: 'u1',
				patient: patientId,
				documentType: DHDocumentType.MEDICATION,
			};

			const results = await service.search(vector, filter);

			expect(qdrantClient.query).toHaveBeenCalledWith(
				'dh_vectors',
				expect.objectContaining({
					query: vector,
					filter: {
						must: [
							{ key: 'userId', match: { value: 'u1' } },
							{ key: 'patient', match: { value: patientId } },
							{
								key: 'documentType',
								match: { value: DHDocumentType.MEDICATION },
							},
						],
					},
				}),
			);
			expect(results).toHaveLength(1);
		});
	});

	describe('deleteByDocumentId', () => {
		it('should delete vectors by documentId match', async () => {
			qdrantClient.delete.mockResolvedValue({} as any);

			await service.deleteByDocumentId('doc-123');

			expect(qdrantClient.delete).toHaveBeenCalledWith('dh_vectors', {
				filter: {
					must: [{ key: 'documentId', match: { value: 'doc-123' } }],
				},
			});
		});
	});

	describe('cleanOrphans', () => {
		it('should delete all vectors for a userId', async () => {
			qdrantClient.delete.mockResolvedValue({} as any);

			await service.cleanOrphans('u1');

			expect(qdrantClient.delete).toHaveBeenCalledWith('dh_vectors', {
				wait: true,
				filter: {
					must: [{ key: 'userId', match: { value: 'u1' } }],
				},
			});
		});
	});
});

describe('DhVectorsService without a vector store', () => {
	const dto = {
		userId: 'u1',
		patient: new Types.ObjectId().toString(),
		documentType: DHDocumentType.MEDICATION,
		documentId: 'doc-123',
		summary: 'Take Metformin 500mg daily',
	};

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('turns every operation into a no-op when nothing is configured', async () => {
		vi.stubEnv('GOOGLE_API_KEY', '');
		vi.stubEnv('QDRANT_URL', '');
		// The module's factory provides null when the store isn't configured.
		const service = new DhVectorsService(null);

		expect(() => service.onModuleInit()).not.toThrow();
		await expect(service.create(dto as any)).resolves.toBeUndefined();
		await expect(service.index(dto as any)).resolves.toBeUndefined();
		await expect(service.bulkCreate([dto as any])).resolves.toBeUndefined();
		await expect(
			service.findSimilar({ ...dto, query: 'metformin' }),
		).resolves.toEqual([]);
		await expect(service.findAll({ ...dto, query: 'x' })).resolves.toEqual([]);
		await expect(service.search([0.1], dto)).resolves.toEqual([]);
		await expect(service.deleteByDocumentId('doc-123')).resolves.toBe(
			undefined,
		);
		await expect(service.cleanOrphans('u1')).resolves.toBeUndefined();
	});

	it('with Qdrant but no Gemini: no indexing or search, but still erases', async () => {
		vi.stubEnv('GOOGLE_API_KEY', '');
		vi.stubEnv('QDRANT_URL', 'http://qdrant.test:6333');
		const qdrant = mockDeep<QdrantClient>();
		qdrant.delete.mockResolvedValue({} as any);
		const service = new DhVectorsService(qdrant);

		service.onModuleInit();
		await expect(service.index(dto as any)).resolves.toBeUndefined();
		await expect(
			service.findSimilar({ ...dto, query: 'metformin' }),
		).resolves.toEqual([]);
		expect(qdrant.getCollections).not.toHaveBeenCalled();
		expect(qdrant.upsert).not.toHaveBeenCalled();
		expect(qdrant.query).not.toHaveBeenCalled();

		await service.cleanOrphans('u1');
		expect(qdrant.delete).toHaveBeenCalledWith('dh_vectors', {
			wait: true,
			filter: { must: [{ key: 'userId', match: { value: 'u1' } }] },
		});
		await service.deleteByDocumentId('doc-123');
		expect(qdrant.delete).toHaveBeenCalledWith('dh_vectors', {
			filter: { must: [{ key: 'documentId', match: { value: 'doc-123' } }] },
		});
	});

	it('does not fail startup when Qdrant is unreachable, and skips writes and searches', async () => {
		vi.stubEnv('GOOGLE_API_KEY', 'test-key');
		vi.stubEnv('QDRANT_URL', 'http://127.0.0.1:6399');
		const qdrant = mockDeep<QdrantClient>();
		qdrant.getCollections.mockRejectedValue(new Error('ECONNREFUSED'));
		const service = new DhVectorsService(qdrant);

		expect(() => service.onModuleInit()).not.toThrow();
		await expect(
			service.findSimilar({ ...dto, query: 'metformin' }),
		).resolves.toEqual([]);
		await expect(service.index(dto as any)).resolves.toBeUndefined();
		expect(qdrant.query).not.toHaveBeenCalled();
		expect(qdrant.upsert).not.toHaveBeenCalled();
	});

	it('fails the purge when Qdrant is configured but the erase fails', async () => {
		vi.stubEnv('GOOGLE_API_KEY', '');
		vi.stubEnv('QDRANT_URL', 'http://127.0.0.1:6399');
		const qdrant = mockDeep<QdrantClient>();
		qdrant.delete.mockRejectedValue(new Error('ECONNREFUSED'));
		const service = new DhVectorsService(qdrant);

		await expect(service.cleanOrphans('u1')).rejects.toThrow(
			/Erasure incomplete/,
		);
	});

	it('treats a collection that was never created as nothing to erase', async () => {
		vi.stubEnv('GOOGLE_API_KEY', '');
		vi.stubEnv('QDRANT_URL', 'http://qdrant.test:6333');
		const qdrant = mockDeep<QdrantClient>();
		qdrant.delete.mockRejectedValue(
			Object.assign(
				new Error("Not found: Collection `dh_vectors` doesn't exist!"),
				{
					status: 404,
				},
			),
		);
		const service = new DhVectorsService(qdrant);

		await expect(service.cleanOrphans('u1')).resolves.toBeUndefined();
		await expect(service.deleteByDocumentId('doc-123')).resolves.toBe(
			undefined,
		);
		expect(qdrant.delete).toHaveBeenCalledTimes(2);
	});
});

describe('DhVectorsService setup timeout and retry', () => {
	const dto = {
		userId: 'u1',
		patient: new Types.ObjectId().toString(),
		documentType: DHDocumentType.MEDICATION,
		documentId: 'doc-123',
		summary: 'Take Metformin 500mg daily',
	};

	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubEnv('GOOGLE_API_KEY', 'test-key');
		vi.stubEnv('QDRANT_URL', 'http://qdrant.test:6333');
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
	});

	it('gives up on a hung Qdrant after the timeout and retries in the background', async () => {
		const qdrant = mockDeep<QdrantClient>();
		// Black-holed: never answers.
		qdrant.getCollections.mockReturnValue(new Promise(() => undefined));
		const service = new DhVectorsService(qdrant);
		const embed = vi.fn();
		(service as any).embeddings.embedQuery = embed;

		service.onModuleInit();
		// While setup is pending, a write is skipped at once, not held up.
		await expect(service.index(dto as any)).resolves.toBeUndefined();
		expect(embed).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(10_000);
		expect((service as any).state).toBe('unavailable');
		expect(qdrant.getCollections).toHaveBeenCalledTimes(1);

		// Before the retry interval: no new attempt.
		await service.index(dto as any);
		expect(qdrant.getCollections).toHaveBeenCalledTimes(1);

		// Qdrant is back; the next call after the interval retries without
		// waiting for it, and later calls use the store.
		qdrant.getCollections.mockResolvedValue({
			collections: [{ name: 'dh_vectors' }],
		} as any);
		qdrant.getCollection.mockResolvedValue({ payload_schema: {} } as any);
		qdrant.createPayloadIndex.mockResolvedValue({} as any);
		await vi.advanceTimersByTimeAsync(60_000);
		await expect(service.index(dto as any)).resolves.toBeUndefined();
		expect(qdrant.getCollections).toHaveBeenCalledTimes(2);
		expect(embed).not.toHaveBeenCalled();

		await service.whenSetUp();
		expect((service as any).state).toBe('ready');
		embed.mockResolvedValue([0.1]);
		qdrant.upsert.mockResolvedValue({ status: 'completed' } as any);
		await service.index(dto as any);
		expect(embed).toHaveBeenCalledWith(dto.summary);
	});
});
