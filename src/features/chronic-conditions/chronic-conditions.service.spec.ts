import { getModelToken } from '@nestjs/mongoose';
import { type Mocked, TestBed } from '@suites/unit';
import { Model, Types } from 'mongoose';
import { Patient } from '../../features/patients/entities/patient.entity';
import { DhVectorsService } from '../dh-vectors/dh-vectors.service';
import { DHDocumentType } from '../dh-vectors/dto';
import { ChronicConditionsService } from './chronic-conditions.service';
import { ChronicCondition } from './entities/chronic-condition.entity';

describe('ChronicConditionsService', () => {
	let service: ChronicConditionsService;
	let chronicConditionModel: Mocked<Model<ChronicCondition>>;
	let patientModel: Mocked<Model<Patient>>;
	let dhVectorsService: Mocked<DhVectorsService>;

	beforeAll(async () => {
		const { unit, unitRef } = await TestBed.solitary(
			ChronicConditionsService,
		).compile();

		service = unit;
		chronicConditionModel = unitRef.get(getModelToken(ChronicCondition.name));
		patientModel = unitRef.get(getModelToken(Patient.name));
		dhVectorsService = unitRef.get(DhVectorsService);
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	describe('upsertChronicCondition', () => {
		it('should upsert chronic condition using conditionName regex when vector search returns no match', async () => {
			dhVectorsService.findAll.mockResolvedValue([]);

			const mockObjectId = new Types.ObjectId();
			const mockChronicCondition = {
				_id: mockObjectId,
				conditionName: 'Hypertension',
				qdrantId: 'qdrant-uuid-1',
			};

			chronicConditionModel.findOneAndUpdate.mockResolvedValue(
				mockChronicCondition as any,
			);
			patientModel.findByIdAndUpdate.mockResolvedValue({} as any);
			dhVectorsService.create.mockResolvedValue({} as any);

			const filters = {
				userId: 'user-123',
				patient: 'patient-456',
				conditionName: 'Hypertension',
			};
			const dto = { conditionName: 'Hypertension', notes: 'Mild' };

			const result = await service.upsertChronicCondition(filters, dto as any);

			expect(dhVectorsService.findAll).toHaveBeenCalledWith({
				userId: 'user-123',
				patient: 'patient-456',
				documentType: DHDocumentType.CHRONIC_CONDITION,
				query: 'hypertension',
			});

			expect(chronicConditionModel.findOneAndUpdate).toHaveBeenCalledWith(
				{
					userId: 'user-123',
					patient: 'patient-456',
					conditionName: expect.any(RegExp),
				},
				{
					$set: { ...dto },
					$setOnInsert: { qdrantId: expect.any(String) },
				},
				{ returnDocument: 'after', upsert: true },
			);

			expect(patientModel.findByIdAndUpdate).toHaveBeenCalledWith(
				'patient-456',
				{
					$addToSet: { chronicConditions: 'hypertension' },
				},
			);

			expect(dhVectorsService.create).toHaveBeenCalledWith({
				qdrantId: 'qdrant-uuid-1',
				userId: 'user-123',
				patient: 'patient-456',
				documentType: DHDocumentType.CHRONIC_CONDITION,
				documentId: mockObjectId.toString(),
				summary: expect.stringContaining('Chronic Condition: Hypertension'),
			});

			expect(result).toEqual(mockObjectId);
		});

		it('should upsert chronic condition by vector documentId when vector search returns a match', async () => {
			const existingDocId = new Types.ObjectId().toString();
			dhVectorsService.findAll.mockResolvedValue([
				{ item: { documentId: existingDocId } } as any,
			]);

			const mockChronicCondition = {
				_id: new Types.ObjectId(existingDocId),
				conditionName: 'Diabetes',
				qdrantId: 'qdrant-uuid-2',
			};

			chronicConditionModel.findOneAndUpdate.mockResolvedValue(
				mockChronicCondition as any,
			);
			patientModel.findByIdAndUpdate.mockResolvedValue({} as any);
			dhVectorsService.create.mockResolvedValue({} as any);

			const filters = {
				userId: 'user-123',
				patient: 'patient-456',
				conditionName: 'Diabetes',
			};
			const dto = { conditionName: 'Diabetes' };

			await service.upsertChronicCondition(filters, dto as any);

			expect(chronicConditionModel.findOneAndUpdate).toHaveBeenCalledWith(
				{ _id: new Types.ObjectId(existingDocId) },
				expect.any(Object),
				expect.any(Object),
			);
		});
	});

	describe('findAllByQuery', () => {
		it('should find conditions matching query filter', async () => {
			const mockConditions = [{ conditionName: 'Asthma' }];
			const mockQueryChain = {
				limit: vi.fn().mockReturnThis(),
				sort: vi.fn().mockReturnThis(),
				select: vi.fn().mockReturnThis(),
				lean: vi.fn().mockResolvedValue(mockConditions),
			};

			chronicConditionModel.find.mockReturnValue(mockQueryChain as any);

			const result = await service.findAllByQuery({
				query: { userId: 'user-1' },
				limit: 5,
				projection: 'conditionName',
			});

			expect(chronicConditionModel.find).toHaveBeenCalledWith({
				userId: 'user-1',
			});
			expect(mockQueryChain.limit).toHaveBeenCalledWith(5);
			expect(mockQueryChain.select).toHaveBeenCalledWith('conditionName');
			expect(result).toEqual(mockConditions);
		});
	});

	describe('findByUserId', () => {
		it('should query chronic conditions by userId with pagination', async () => {
			const mockConditions = [{ conditionName: 'Hypertension' }];
			const mockQueryChain = {
				skip: vi.fn().mockReturnThis(),
				limit: vi.fn().mockReturnThis(),
				sort: vi.fn().mockReturnThis(),
				select: vi.fn().mockResolvedValue(mockConditions),
			};

			chronicConditionModel.find.mockReturnValue(mockQueryChain as any);

			const result = await service.findByUserId('user-1', 0, 10);

			expect(chronicConditionModel.find).toHaveBeenCalledWith({
				userId: 'user-1',
			});
			expect(mockQueryChain.skip).toHaveBeenCalledWith(0);
			expect(mockQueryChain.limit).toHaveBeenCalledWith(10);
			expect(result).toEqual(mockConditions);
		});
	});

	describe('countByUserId', () => {
		it('should return count of conditions by userId', async () => {
			chronicConditionModel.countDocuments.mockResolvedValue(3);

			const count = await service.countByUserId('user-1');

			expect(chronicConditionModel.countDocuments).toHaveBeenCalledWith({
				userId: 'user-1',
			});
			expect(count).toBe(3);
		});
	});

	describe('removeByUserId', () => {
		it('should delete all conditions for a userId', async () => {
			chronicConditionModel.deleteMany.mockResolvedValue({
				deletedCount: 2,
			} as any);

			const result = await service.removeByUserId('user-1');

			expect(chronicConditionModel.deleteMany).toHaveBeenCalledWith({
				userId: 'user-1',
			});
			expect(result).toEqual({ deletedCount: 2 });
		});
	});
});
