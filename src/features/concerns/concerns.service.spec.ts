import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { type Mocked, TestBed } from '@suites/unit';
import { Model, Types } from 'mongoose';
import { PatientsService } from '../patients/patients.service';
import { ConcernsService } from './concerns.service';
import { Concern, ConcernTypeEnum } from './entities/concern.entity';

describe('ConcernsService', () => {
	let service: ConcernsService;
	let concernModel: Mocked<Model<Concern>>;
	let patientsService: Mocked<PatientsService>;

	beforeAll(async () => {
		const { unit, unitRef } = await TestBed.solitary(ConcernsService).compile();

		service = unit;
		concernModel = unitRef.get(getModelToken(Concern.name));
		patientsService = unitRef.get(PatientsService);
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	describe('create', () => {
		it('should create a symptom concern when patient exists', async () => {
			const mockPatientId = new Types.ObjectId();
			const mockFacilityId = new Types.ObjectId();
			patientsService.findPatientByUserId.mockResolvedValue({
				_id: mockPatientId,
				facility: mockFacilityId,
			} as any);

			const mockSymptomId = new Types.ObjectId();
			concernModel.create.mockResolvedValue({
				_id: mockSymptomId,
			} as any);

			const dto = { description: 'Headache' };
			const result = await service.create('user-1', dto as any);

			expect(patientsService.findPatientByUserId).toHaveBeenCalledWith(
				'user-1',
				'_id facility',
			);
			expect(concernModel.create).toHaveBeenCalledWith({
				userId: 'user-1',
				patient: mockPatientId,
				host: mockFacilityId,
				concernType: ConcernTypeEnum.SYMPTOMS,
				onsetDate: expect.any(Date),
				description: 'Headache',
			});
			expect(result).toEqual(mockSymptomId);
		});

		it('should throw NotFoundException if patient record does not exist', async () => {
			patientsService.findPatientByUserId.mockResolvedValue(null);

			await expect(
				service.create('invalid-user', { description: 'Fever' } as any),
			).rejects.toThrow(NotFoundException);
		});
	});

	describe('upsertConcern', () => {
		it('should upsert concern document and return _id', async () => {
			const mockConcernId = new Types.ObjectId();
			concernModel.findOneAndUpdate.mockResolvedValue({
				_id: mockConcernId,
			} as any);

			const filters = {
				userId: 'user-1',
				concernType: ConcernTypeEnum.SYMPTOMS,
			};
			const dto = { description: 'Nausea' };

			const result = await service.upsertConcern(filters, dto as any);

			expect(concernModel.findOneAndUpdate).toHaveBeenCalledWith(
				filters,
				{
					$set: { ...dto },
					$setOnInsert: { qdrantId: expect.any(String) },
				},
				{ returnDocument: 'after', upsert: true },
			);
			expect(result).toEqual(mockConcernId);
		});
	});

	describe('findSymptomById', () => {
		it('should find symptom by id and userId', async () => {
			const mockSymptom = { _id: 'sym-1', description: 'Cough' };
			const mockQueryChain = {
				select: vi.fn().mockResolvedValue(mockSymptom),
			};
			concernModel.findOne.mockReturnValue(mockQueryChain as any);

			const result = await service.findSymptomById('sym-1', 'user-1');

			expect(concernModel.findOne).toHaveBeenCalledWith({
				_id: 'sym-1',
				userId: 'user-1',
				concernType: ConcernTypeEnum.SYMPTOMS,
			});
			expect(result).toEqual(mockSymptom);
		});

		it('should throw NotFoundException if symptom is missing', async () => {
			const mockQueryChain = {
				select: vi.fn().mockResolvedValue(null),
			};
			concernModel.findOne.mockReturnValue(mockQueryChain as any);

			await expect(
				service.findSymptomById('invalid-id', 'user-1'),
			).rejects.toThrow(NotFoundException);
		});
	});

	describe('updateSymptom', () => {
		it('should update symptom and return updated _id', async () => {
			const mockSymptomId = new Types.ObjectId();
			concernModel.findOneAndUpdate.mockResolvedValue({
				_id: mockSymptomId,
			} as any);

			const dto = { description: 'Severe Headache' };
			const result = await service.updateSymptom('sym-1', 'user-1', dto as any);

			expect(concernModel.findOneAndUpdate).toHaveBeenCalledWith(
				{
					_id: 'sym-1',
					userId: 'user-1',
					concernType: ConcernTypeEnum.SYMPTOMS,
				},
				{ $set: dto },
				{ new: true },
			);
			expect(result).toBe(mockSymptomId.toString());
		});
	});

	describe('deleteSymptom', () => {
		it('should delete symptom by id and userId', async () => {
			const mockSymptom = { _id: 'sym-1' };
			concernModel.findOneAndDelete.mockResolvedValue(mockSymptom as any);

			const result = await service.deleteSymptom('sym-1', 'user-1');

			expect(concernModel.findOneAndDelete).toHaveBeenCalledWith({
				_id: 'sym-1',
				userId: 'user-1',
				concernType: ConcernTypeEnum.SYMPTOMS,
			});
			expect(result).toEqual(mockSymptom);
		});
	});

	describe('fetchSymptoms', () => {
		it('should return paginated symptoms and count for a user', async () => {
			const mockSymptoms = [{ description: 'Back pain' }];
			const mockQueryChain = {
				select: vi.fn().mockReturnThis(),
				skip: vi.fn().mockReturnThis(),
				limit: vi.fn().mockReturnThis(),
				sort: vi.fn().mockResolvedValue(mockSymptoms),
			};

			concernModel.find.mockReturnValue(mockQueryChain as any);
			concernModel.countDocuments.mockResolvedValue(1);

			const result = await service.fetchSymptoms('user-1', {
				page: 1,
				pageSize: 10,
			} as any);

			expect(concernModel.find).toHaveBeenCalledWith({
				userId: 'user-1',
				concernType: ConcernTypeEnum.SYMPTOMS,
			});
			expect(result).toEqual({ rows: mockSymptoms, count: 1 });
		});
	});

	describe('facility methods', () => {
		it('findAllSymptomsForFacility should return paginated facility symptoms', async () => {
			const facilityId = new Types.ObjectId().toString();
			const patientId = new Types.ObjectId().toString();
			const mockSymptoms = [{ description: 'Dizziness' }];

			const mockQueryChain = {
				select: vi.fn().mockReturnThis(),
				skip: vi.fn().mockReturnThis(),
				limit: vi.fn().mockReturnThis(),
				sort: vi.fn().mockResolvedValue(mockSymptoms),
			};

			concernModel.find.mockReturnValue(mockQueryChain as any);
			concernModel.countDocuments.mockResolvedValue(1);

			const result = await service.findAllSymptomsForFacility(
				facilityId,
				patientId,
				{ page: 1, pageSize: 10 } as any,
			);

			expect(concernModel.find).toHaveBeenCalledWith({
				host: new Types.ObjectId(facilityId),
				patient: new Types.ObjectId(patientId),
				concernType: ConcernTypeEnum.SYMPTOMS,
			});
			expect(result).toEqual({ rows: mockSymptoms, count: 1 });
		});

		it('resolveSymptomForFacility should update resolved to true', async () => {
			const facilityId = new Types.ObjectId().toString();
			const patientId = new Types.ObjectId().toString();
			const mockSymptom = { _id: 'sym-1', resolved: true };

			concernModel.findOneAndUpdate.mockResolvedValue(mockSymptom as any);

			const result = await service.resolveSymptomForFacility(
				facilityId,
				patientId,
				'sym-1',
			);

			expect(concernModel.findOneAndUpdate).toHaveBeenCalledWith(
				{
					_id: 'sym-1',
					host: new Types.ObjectId(facilityId),
					patient: new Types.ObjectId(patientId),
					concernType: ConcernTypeEnum.SYMPTOMS,
				},
				{ $set: { resolved: true } },
				{ new: true },
			);
			expect(result).toEqual(mockSymptom);
		});
	});

	describe('removeByUserId', () => {
		it('should delete all concerns for a userId', async () => {
			concernModel.deleteMany.mockResolvedValue({ deletedCount: 5 } as any);

			const result = await service.removeByUserId('user-1');

			expect(concernModel.deleteMany).toHaveBeenCalledWith({
				userId: 'user-1',
			});
			expect(result).toEqual({ deletedCount: 5 });
		});
	});
});
