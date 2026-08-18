import { getModelToken } from '@nestjs/mongoose';
import { type Mocked, TestBed } from '@suites/unit';
import { Model, Types } from 'mongoose';
import { AdherenceStatus } from '@/features/patients/dto';
import { Patient } from '@/features/patients/entities/patient.entity';
import { Medication } from '../medications/entities/medication.entity';
import { AdherencesService } from './adherences.service';
import { AdherenceLog, TargetType } from './entities/adherence-log.entity';
import { AdherencePattern } from './entities/adherence-pattern.entity';

describe('AdherencesService', () => {
	let service: AdherencesService;
	let adherenceLogModel: Mocked<Model<AdherenceLog>>;
	let adherencePatternModel: Mocked<Model<AdherencePattern>>;
	let patientModel: Mocked<Model<Patient>>;
	let medicationModel: Mocked<Model<Medication>>;

	beforeAll(async () => {
		const { unit, unitRef } =
			await TestBed.solitary(AdherencesService).compile();

		service = unit;
		adherenceLogModel = unitRef.get(getModelToken(AdherenceLog.name));
		adherencePatternModel = unitRef.get(getModelToken(AdherencePattern.name));
		patientModel = unitRef.get(getModelToken(Patient.name));
		medicationModel = unitRef.get(getModelToken(Medication.name));
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	describe('upsertAdherenceLog', () => {
		it('should upsert adherence log and update patient adherence rate & status', async () => {
			const mockId = new Types.ObjectId();
			const mockLog = { _id: mockId };
			adherenceLogModel.findOneAndUpdate.mockResolvedValue(mockLog as any);

			const startDate = new Date();
			startDate.setDate(startDate.getDate() - 10);
			medicationModel.find.mockReturnValue({
				select: vi.fn().mockReturnThis(),
				lean: vi.fn().mockResolvedValue([
					{
						startDate,
						frequency: { repeatEvery: 1 },
					},
				]),
			} as any);

			adherenceLogModel.countDocuments.mockResolvedValue(10);
			patientModel.findByIdAndUpdate.mockResolvedValue({} as any);

			const filters = { userId: 'u1', patient: 'p1' };
			const dto = {
				patient: 'p1',
				taken: true,
				targetType: TargetType.MEDICATION,
			};

			const result = await service.upsertAdherenceLog(filters, dto as any);

			expect(adherenceLogModel.findOneAndUpdate).toHaveBeenCalledWith(
				filters,
				{
					$set: { ...dto },
					$setOnInsert: { qdrantId: expect.any(String) },
				},
				{ returnDocument: 'after', upsert: true },
			);

			expect(patientModel.findByIdAndUpdate).toHaveBeenCalledWith(
				'p1',
				expect.objectContaining({
					$set: expect.objectContaining({
						adherenceStatus: AdherenceStatus.STABLE,
					}),
				}),
			);

			expect(result).toEqual(mockId);
		});
	});

	describe('upsertAdherencePattern', () => {
		it('should upsert adherence pattern', async () => {
			const mockId = new Types.ObjectId();
			adherencePatternModel.findOneAndUpdate.mockResolvedValue({
				_id: mockId,
			} as any);

			const filters = { userId: 'u1', targetName: 'Metformin' };
			const dto = { adherenceRate: 90 };

			const result = await service.upsertAdherencePattern(filters, dto as any);

			expect(adherencePatternModel.findOneAndUpdate).toHaveBeenCalledWith(
				filters,
				dto,
				{ returnDocument: 'after', upsert: true },
			);
			expect(result).toEqual(mockId);
		});
	});

	describe('aggregateMedicationAdherence', () => {
		it('should calculate 7-day adherence percentage', async () => {
			adherenceLogModel.aggregate.mockResolvedValue([{ uniqueDays: 7 }] as any);

			const rate = await service.aggregateMedicationAdherence('u1');

			expect(adherenceLogModel.aggregate).toHaveBeenCalled();
			expect(rate).toBe(88); // 7 unique days out of 8-day inclusive window (7/8 * 100) = 87.5 -> 88
		});
	});

	describe('aggregateMedicationTakenByWeek', () => {
		it('should return weekly breakdown of taken days', async () => {
			const now = new Date();
			adherenceLogModel.find.mockResolvedValue([
				{ taken: true, takenAt: now },
			] as any);

			const days = await service.aggregateMedicationTakenByWeek('u1');

			expect(days.length).toBe(7);
			expect(days).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						label: expect.any(String),
					}),
				]),
			);
		});
	});

	describe('remove functions', () => {
		it('removeLogsByTargetName should delete medication logs matching targetName', async () => {
			adherenceLogModel.deleteMany.mockResolvedValue({
				deletedCount: 2,
			} as any);

			const result = await service.removeLogsByTargetName('u1', 'Aspirin');

			expect(adherenceLogModel.deleteMany).toHaveBeenCalledWith({
				userId: 'u1',
				targetType: TargetType.MEDICATION,
				targetName: 'Aspirin',
			});
			expect(result).toEqual({ deletedCount: 2 });
		});

		it('removeLogsByUserId should delete all adherence logs for a user', async () => {
			adherenceLogModel.deleteMany.mockResolvedValue({
				deletedCount: 10,
			} as any);

			const result = await service.removeLogsByUserId('u1');

			expect(adherenceLogModel.deleteMany).toHaveBeenCalledWith({
				userId: 'u1',
			});
			expect(result).toEqual({ deletedCount: 10 });
		});
	});
});
