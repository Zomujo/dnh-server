import { getModelToken } from '@nestjs/mongoose';
import { type Mocked, TestBed } from '@suites/unit';
import { set, startOfDay, subDays } from 'date-fns';
import { Model, Types } from 'mongoose';
import { AdherenceStatus } from '@/features/patients/dto';
import { Patient } from '@/features/patients/entities/patient.entity';
import { Medication } from '../medications/entities/medication.entity';
import { AdherencesService } from './adherences.service';
import { AdherenceLog, TargetType } from './entities/adherence-log.entity';
import {
	AdherencePattern,
	PatternTargetType,
} from './entities/adherence-pattern.entity';

const MORNING = { time: { hour: 8, minutes: 0, timeDesignators: 'AM' } };

/** A morning-only medication, added long before any window under test. */
const morningMedication = (id = new Types.ObjectId()) => ({
	_id: id,
	name: 'Metformin',
	patient: 'p1',
	startDate: new Date('2026-01-01T08:00:00'),
	createdAt: new Date('2026-01-01T07:00:00'),
	morning: MORNING,
});

/** A confirmed log for the morning dose `daysAgo` days before `now`. */
const takenMorning = (
	medication: Types.ObjectId,
	now: Date,
	daysAgo: number,
) => ({
	_id: new Types.ObjectId(),
	medication,
	scheduledFor: set(startOfDay(subDays(now, daysAgo)), { hours: 8 }),
	taken: true,
	status: 'taken',
});

const chain = (result: unknown) =>
	({
		select: vi.fn().mockReturnThis(),
		lean: vi.fn().mockResolvedValue(result),
	}) as any;

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
		adherenceLogModel = unitRef.get(
			getModelToken(AdherenceLog.name),
		) as unknown as Mocked<Model<AdherenceLog>>;
		adherencePatternModel = unitRef.get(
			getModelToken(AdherencePattern.name),
		) as unknown as Mocked<Model<AdherencePattern>>;
		patientModel = unitRef.get(
			getModelToken(Patient.name),
		) as unknown as Mocked<Model<Patient>>;
		medicationModel = unitRef.get(
			getModelToken(Medication.name),
		) as unknown as Mocked<Model<Medication>>;
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	describe('upsertAdherenceLog', () => {
		it('should upsert adherence log and update patient adherence rate & status', async () => {
			const mockId = new Types.ObjectId();
			const mockLog = { _id: mockId };
			adherenceLogModel.findOneAndUpdate.mockResolvedValue(mockLog as any);

			// Every morning dose of the last 30 days taken.
			const now = new Date();
			const medication = morningMedication();
			medicationModel.find.mockReturnValue(chain([medication]));
			adherenceLogModel.find.mockReturnValue(
				chain(
					Array.from({ length: 30 }, (_, i) =>
						takenMorning(medication._id, now, i),
					),
				),
			);
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
		it('divides doses taken by doses settled over the last 7 days', async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2026-06-10T12:00:00'));
			const now = new Date();
			const medication = morningMedication();
			medicationModel.find.mockReturnValue(chain([medication]));
			// Jun 4–7 taken. Jun 8 is past the 48 h window, so missed; Jun 9
			// and 10 can still be confirmed, so they don't count yet.
			adherenceLogModel.find.mockReturnValue(
				chain([3, 4, 5, 6].map((d) => takenMorning(medication._id, now, d))),
			);

			const rate = await service.aggregateMedicationAdherence('u1');

			expect(rate).toBe(80); // 4 of 5 settled doses
		});
	});

	describe('aggregateMedicationTakenByWeek', () => {
		it('counts doses per day and is taken only when all were', async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2026-06-10T12:00:00')); // a Wednesday
			const now = new Date();
			const medication = {
				...morningMedication(),
				evening: { time: { hour: 8, minutes: 0, timeDesignators: 'PM' } },
			};
			medicationModel.find.mockReturnValue(chain([medication]));
			// Monday: both doses. Tuesday: morning only.
			adherenceLogModel.find.mockReturnValue(
				chain([
					takenMorning(medication._id, now, 2),
					{
						...takenMorning(medication._id, now, 2),
						_id: new Types.ObjectId(),
						scheduledFor: new Date('2026-06-08T20:00:00'),
					},
					takenMorning(medication._id, now, 1),
				]),
			);

			const days = await service.aggregateMedicationTakenByWeek('u1');

			expect(days).toHaveLength(7);
			expect(days[0]).toMatchObject({
				label: 'M',
				taken: true,
				takenDoses: 2,
				scheduledDoses: 2,
			});
			// Tuesday's evening dose can still be confirmed.
			expect(days[1]).toMatchObject({
				taken: null,
				takenDoses: 1,
				scheduledDoses: 2,
			});
			expect(days[6]).toMatchObject({ label: 'S', taken: null });
		});
	});

	describe('recordMissedDoses', () => {
		it('writes a missed log for each unconfirmed dose past its window', async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2026-06-10T12:00:00'));
			const now = new Date();
			const medication = morningMedication();
			medicationModel.distinct.mockResolvedValue(['u1'] as any);
			medicationModel.find.mockReturnValue(chain([medication]));
			// The window is the 72 h before now − 48 h: the mornings of Jun 6,
			// 7 and 8. Jun 7 was confirmed.
			adherenceLogModel.find.mockReturnValue(
				chain([takenMorning(medication._id, now, 3)]),
			);
			adherenceLogModel.updateOne.mockResolvedValue({
				upsertedId: new Types.ObjectId(),
			} as any);
			adherenceLogModel.findById.mockResolvedValue(null);
			patientModel.findByIdAndUpdate.mockResolvedValue({} as any);

			const recorded = await service.recordMissedDoses(now);

			expect(recorded).toBe(2);
			expect(adherenceLogModel.updateOne).toHaveBeenCalledWith(
				{
					userId: 'u1',
					medication: medication._id,
					scheduledFor: new Date('2026-06-08T08:00:00'),
				},
				{
					$setOnInsert: expect.objectContaining({
						taken: false,
						status: 'missed',
						section: 'morning',
					}),
				},
				{ upsert: true },
			);
			expect(patientModel.findByIdAndUpdate).toHaveBeenCalledTimes(1);
		});

		it('does not count a dose another run already recorded', async () => {
			medicationModel.distinct.mockResolvedValue(['u1'] as any);
			medicationModel.find.mockReturnValue(chain([morningMedication()]));
			adherenceLogModel.find.mockReturnValue(chain([]));
			adherenceLogModel.updateOne.mockResolvedValue({
				upsertedId: null,
			} as any);

			expect(await service.recordMissedDoses()).toBe(0);
			expect(patientModel.findByIdAndUpdate).not.toHaveBeenCalled();
		});
	});

	describe('remove functions', () => {
		describe('removeMedicationHistory', () => {
			const medicationId = new Types.ObjectId();

			it('deletes logs by medication id and, when the name is free, name-level data', async () => {
				adherenceLogModel.deleteMany
					.mockResolvedValueOnce({ deletedCount: 3 } as any)
					.mockResolvedValueOnce({ deletedCount: 1 } as any);
				adherencePatternModel.deleteMany.mockResolvedValue({
					deletedCount: 1,
				} as any);

				const result = await service.removeMedicationHistory(
					'u1',
					medicationId,
					'Aspirin',
					false,
				);

				expect(adherenceLogModel.deleteMany).toHaveBeenNthCalledWith(1, {
					userId: 'u1',
					medication: {
						$in: [medicationId.toString(), medicationId],
					},
				});
				expect(adherenceLogModel.deleteMany).toHaveBeenNthCalledWith(2, {
					userId: 'u1',
					targetType: TargetType.MEDICATION,
					targetName: /^Aspirin$/i,
					medication: { $exists: false },
				});
				expect(adherencePatternModel.deleteMany).toHaveBeenCalledWith({
					userId: 'u1',
					targetType: PatternTargetType.MEDICATION,
					targetName: /^Aspirin$/i,
				});
				expect(result).toEqual({ logs: 4, patterns: 1 });
			});

			it('keeps name-level data while another medication has the same name', async () => {
				adherenceLogModel.deleteMany.mockResolvedValue({
					deletedCount: 2,
				} as any);

				const result = await service.removeMedicationHistory(
					'u1',
					medicationId,
					'Aspirin',
					true,
				);

				expect(adherenceLogModel.deleteMany).toHaveBeenCalledTimes(1);
				expect(adherenceLogModel.deleteMany).toHaveBeenCalledWith({
					userId: 'u1',
					medication: {
						$in: [medicationId.toString(), medicationId],
					},
				});
				expect(adherencePatternModel.deleteMany).not.toHaveBeenCalled();
				expect(result).toEqual({ logs: 2, patterns: 0 });
			});
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
