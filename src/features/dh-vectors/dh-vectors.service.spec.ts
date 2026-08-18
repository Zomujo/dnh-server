import type { QdrantClient } from '@qdrant/js-client-rest';
import { type Mocked, TestBed } from '@suites/unit';
import { Types } from 'mongoose';
import { DhVectorsService } from './dh-vectors.service';
import { DHDocumentType } from './dto';

describe('DhVectorsService', () => {
	let service: DhVectorsService;
	let qdrantClient: Mocked<QdrantClient>;

	beforeAll(async () => {
		const { unit, unitRef } =
			await TestBed.solitary(DhVectorsService).compile();

		service = unit;
		qdrantClient = unitRef.get('QDRANT_CLIENT');
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

	describe('search', () => {
		it('should search qdrant with filtered vector query', async () => {
			qdrantClient.search.mockResolvedValue([
				{ id: 'vec-1', payload: { summary: 'Metformin' } },
			] as any);

			const vector = [0.1, 0.2];
			const patientId = new Types.ObjectId().toString();
			const filter = {
				userId: 'u1',
				patient: patientId,
				documentType: DHDocumentType.MEDICATION,
			};

			const results = await service.search(vector, filter);

			expect(qdrantClient.search).toHaveBeenCalledWith(
				'dh_vectors',
				expect.objectContaining({
					vector,
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
				filter: {
					must: [{ key: 'userId', match: { value: 'u1' } }],
				},
			});
		});
	});
});
