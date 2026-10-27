import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { type Mocked, TestBed } from '@suites/unit';
import { Model, Types } from 'mongoose';
import { CacheService } from '@/core/caching/caching.service';
import { VitalHistory } from '@/features/vital-histories/entities/vital-history.entity';
import { ChronicConditionsService } from '../chronic-conditions/chronic-conditions.service';
import { Patient } from './entities/patient.entity';
import { Summary } from './entities/summary.entity';
import { PatientsService } from './patients.service';

describe('PatientsService', () => {
	let service: PatientsService;
	let patientModel: Mocked<Model<Patient>>;
	let summaryModel: Mocked<Model<Summary>>;
	let vitalHistoryModel: Mocked<Model<VitalHistory>>;
	let chronicConditionsService: Mocked<ChronicConditionsService>;
	let summaryCacheService: Mocked<CacheService<string>>;

	beforeAll(async () => {
		const { unit, unitRef } = await TestBed.solitary(PatientsService).compile();

		service = unit;
		patientModel = unitRef.get(getModelToken(Patient.name));
		summaryModel = unitRef.get(getModelToken(Summary.name));
		vitalHistoryModel = unitRef.get(getModelToken(VitalHistory.name));
		chronicConditionsService = unitRef.get(ChronicConditionsService);
		summaryCacheService = unitRef.get(CacheService) as unknown as Mocked<
			CacheService<string>
		>;
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	describe('findPatientById', () => {
		it('should find patient by ObjectId with projection', async () => {
			const mockId = new Types.ObjectId();
			const mockQueryChain = {
				select: vi.fn().mockResolvedValue({ _id: mockId, name: 'John Doe' }),
			};
			patientModel.findById.mockReturnValue(mockQueryChain as any);

			const patient = await service.findPatientById(mockId.toString(), 'name');

			expect(patientModel.findById).toHaveBeenCalledWith(mockId);
			expect(patient).toEqual({ _id: mockId, name: 'John Doe' });
		});
	});

	describe('updatePatient', () => {
		const id = new Types.ObjectId();
		const existing = (name: string) =>
			({ select: vi.fn().mockResolvedValue({ _id: id, name }) }) as any;

		it('joins firstname and lastname into the stored name', async () => {
			patientModel.findById.mockReturnValue(existing('Jackson Jinwoo'));

			await service.updatePatient(id.toString(), {
				firstname: 'Jack',
				lastname: 'Mensah',
				gender: 'male' as any,
			});

			expect(patientModel.findByIdAndUpdate).toHaveBeenCalledWith(id, {
				$set: { name: 'Jack Mensah', gender: 'male' },
			});
		});

		it('keeps the part of the name that was not sent', async () => {
			patientModel.findById.mockReturnValue(existing('Jackson Kofi Jinwoo'));

			await service.updatePatient(id.toString(), { firstname: 'Jack' });

			expect(patientModel.findByIdAndUpdate).toHaveBeenCalledWith(id, {
				$set: { name: 'Jack Kofi Jinwoo' },
			});
		});

		it('leaves the name alone when neither part is sent', async () => {
			patientModel.findById.mockReturnValue(existing('Jackson Jinwoo'));

			await service.updatePatient(id.toString(), { gender: 'female' as any });

			expect(patientModel.findByIdAndUpdate).toHaveBeenCalledWith(id, {
				$set: { gender: 'female' },
			});
		});
	});

	describe('create', () => {
		const noPatient = () =>
			({ select: vi.fn().mockResolvedValue(null) }) as any;

		it('should generate patient code and upsert chronic conditions', async () => {
			patientModel.exists.mockResolvedValue(null as any);
			patientModel.findOne.mockReturnValue(noPatient());

			const mockId = new Types.ObjectId();
			patientModel.create.mockResolvedValue({
				_id: mockId,
				toString: () => mockId.toString(),
			} as any);

			chronicConditionsService.upsertChronicCondition.mockResolvedValue(
				{} as any,
			);

			const dto = {
				userId: 'user-1',
				firstname: 'Jane',
				lastname: 'Doe',
				chronicConditions: ['Hypertension'],
			};

			const result = await service.create(dto as any);

			expect(patientModel.create).toHaveBeenCalledWith(
				expect.objectContaining({
					patientCode: expect.any(String),
					userId: 'user-1',
				}),
			);
			expect(
				chronicConditionsService.upsertChronicCondition,
			).toHaveBeenCalledWith(
				{
					userId: 'user-1',
					patient: mockId.toString(),
					conditionName: 'Hypertension',
				},
				{
					userId: 'user-1',
					patient: mockId.toString(),
					conditionName: 'Hypertension',
				},
			);
			expect(result).toEqual({ patientId: mockId, created: true });
		});

		it('returns the existing patient on a repeat, re-applying its conditions', async () => {
			const existingId = new Types.ObjectId();
			patientModel.findOne.mockReturnValue({
				select: vi.fn().mockResolvedValue({ _id: existingId }),
			} as any);
			chronicConditionsService.upsertChronicCondition.mockResolvedValue(
				{} as any,
			);

			const result = await service.create({
				userId: 'user-1',
				chronicConditions: ['Hypertension'],
			} as any);

			expect(result).toEqual({ patientId: existingId, created: false });
			expect(patientModel.create).not.toHaveBeenCalled();
			// A retry after a half-finished onboarding still saves the conditions.
			expect(
				chronicConditionsService.upsertChronicCondition,
			).toHaveBeenCalledWith(
				expect.objectContaining({ patient: existingId.toString() }),
				expect.anything(),
			);
		});

		it('returns the winner when a concurrent onboard hits the unique index', async () => {
			const winnerId = new Types.ObjectId();
			patientModel.exists.mockResolvedValue(null as any);
			patientModel.findOne
				.mockReturnValueOnce(noPatient())
				.mockReturnValueOnce({
					select: vi.fn().mockResolvedValue({ _id: winnerId }),
				} as any);
			patientModel.create.mockRejectedValue(
				Object.assign(new Error('E11000'), {
					code: 11000,
					keyPattern: { userId: 1 },
				}),
			);

			const result = await service.create({
				userId: 'user-1',
				chronicConditions: ['Hypertension'],
			} as any);

			expect(result).toEqual({ patientId: winnerId, created: false });
			expect(
				chronicConditionsService.upsertChronicCondition,
			).not.toHaveBeenCalled();
		});
	});

	describe('upsertPatient', () => {
		it('should upsert patient document', async () => {
			const mockId = new Types.ObjectId();
			patientModel.findOneAndUpdate.mockResolvedValue({ _id: mockId } as any);

			const filters = { userId: 'user-1' };
			const dto = { name: 'Updated Name' };

			const result = await service.upsertPatient(filters, dto);

			expect(patientModel.findOneAndUpdate).toHaveBeenCalledWith(
				filters,
				{
					$set: { name: 'Updated Name' },
					$setOnInsert: { qdrantId: expect.any(String) },
				},
				{ returnDocument: 'after', upsert: true },
			);
			expect(result).toEqual(mockId);
		});
	});

	describe('fetchLatestPatientVitals', () => {
		it('should aggregate vitalHistoryModel and return latest vitals with count', async () => {
			const mockId = new Types.ObjectId();
			const mockPatient = { _id: mockId, userId: 'user-123' };

			const mockQueryChain = {
				select: vi.fn().mockResolvedValue(mockPatient),
			};
			patientModel.findById.mockReturnValue(mockQueryChain as any);

			const mockVitals = [{ vitalType: 'bloodPressure', value: '120/80' }];

			vitalHistoryModel.aggregate
				.mockResolvedValueOnce(mockVitals as any)
				.mockResolvedValueOnce([{ total: 1 }] as any);

			const result = await service.fetchLatestPatientVitals(mockId.toString());

			expect(patientModel.findById).toHaveBeenCalledWith(mockId);
			expect(vitalHistoryModel.aggregate).toHaveBeenCalledTimes(2);
			expect(result).toEqual({ rows: mockVitals, count: 1 });
		});
	});

	describe('removeSummariesByUserId', () => {
		it('should delete all summaries for a userId', async () => {
			summaryModel.deleteMany.mockResolvedValue({ deletedCount: 3 } as any);

			const result = await service.removeSummariesByUserId('user-123');

			expect(summaryModel.deleteMany).toHaveBeenCalledWith({
				userId: 'user-123',
			});
			expect(result).toEqual({ deletedCount: 3 });
		});
	});

	describe('generateSummary', () => {
		it('should return cached summary if available in summaryCacheService', async () => {
			summaryCacheService.get.mockResolvedValue('Cached patient summary text');

			const observable = await service.generateSummary('user-123');

			expect(summaryCacheService.get).toHaveBeenCalledWith(
				'chronic-care:doctors:patients:summary:user-123',
			);
			expect(observable).toBeDefined();
		});
	});

	describe('findOne', () => {
		it('should find patient by $or userId or _id', async () => {
			const mockId = new Types.ObjectId();
			const mockQueryChain = {
				select: vi.fn().mockReturnThis(),
				populate: vi.fn().mockResolvedValue({ _id: mockId, name: 'Alice' }),
			};
			patientModel.findOne.mockReturnValue(mockQueryChain as any);

			const patient = await service.findOne(mockId.toString());

			expect(patientModel.findOne).toHaveBeenCalledWith({
				$or: [{ userId: mockId.toString() }, { _id: mockId }],
			});
			expect(patient).toEqual({ _id: mockId, name: 'Alice' });
		});

		it('should throw NotFoundException if patient does not exist', async () => {
			const mockQueryChain = {
				select: vi.fn().mockReturnThis(),
				populate: vi.fn().mockResolvedValue(null),
			};
			patientModel.findOne.mockReturnValue(mockQueryChain as any);

			await expect(
				service.findOne(new Types.ObjectId().toString()),
			).rejects.toThrow(NotFoundException);
		});
	});

	describe('removePatientsByUserId', () => {
		it('should delete all patients for a userId', async () => {
			patientModel.deleteMany.mockResolvedValue({ deletedCount: 2 } as any);

			const result = await service.removePatientsByUserId('user-1');

			expect(patientModel.deleteMany).toHaveBeenCalledWith({
				userId: 'user-1',
			});
			expect(result).toEqual({ deletedCount: 2 });
		});
	});
});
