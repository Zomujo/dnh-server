import { getModelToken } from '@nestjs/mongoose';
import { type Mocked, TestBed } from '@suites/unit';
import { set, startOfDay, subDays } from 'date-fns';
import { Model, Types } from 'mongoose';
import { AdherenceStatus } from '@/features/patients/dto';
import { Patient } from '@/features/patients/entities/patient.entity';
import { Medication } from '../medications/entities/medication.entity';
import { AdherencesService } from './adherences.service';
import { AdherenceLog, TargetType } from './entities/adherence-log.entity';
import { AdherencePattern } from './entities/adherence-pattern.entity';

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
		setOptions: vi.fn().mockReturnThis(),
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
		it('divides doses taken by doses scheduled on the days that are over', async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2026-06-10T12:00:00'));
			const now = new Date();
			const medication = morningMedication();
			medicationModel.find.mockReturnValue(chain([medication]));
			// Jun 4–7 taken. Jun 8 and 9 are over with nothing taken, so they
			// count as missed even though Jun 9 can still be confirmed late.
			// Today (Jun 10) doesn't count until it is over.
			adherenceLogModel.find.mockReturnValue(
				chain([3, 4, 5, 6].map((d) => takenMorning(medication._id, now, d))),
			);

			const rate = await service.aggregateMedicationAdherence('u1');

			expect(rate).toBe(67); // 4 of 6 doses
		});

		it('leaves today out while a later dose is still to come', async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2026-06-10T10:00:00'));
			const now = new Date();
			const medication = {
				...morningMedication(),
				startDate: new Date('2026-06-09T00:00:00'),
				createdAt: new Date('2026-06-09T00:00:00'),
				evening: { time: { hour: 8, minutes: 0, timeDesignators: 'PM' } },
			};
			medicationModel.find.mockReturnValue(chain([medication]));
			// Yesterday 1 of 2. Today's morning dose is taken, the evening one
			// is still to come.
			adherenceLogModel.find.mockReturnValue(
				chain([0, 1].map((d) => takenMorning(medication._id, now, d))),
			);

			const rate = await service.aggregateMedicationAdherence('u1');

			expect(rate).toBe(50);
		});
	});

	describe('refreshAdherenceRates', () => {
		it("recomputes each scheduled patient's rate once", async () => {
			medicationModel.find
				.mockReturnValueOnce(
					chain([
						{ userId: 'u1', patient: 'p1' },
						{ userId: 'u1', patient: 'p1' },
						{ userId: 'u2', patient: 'p2' },
						{ userId: 'u3' },
					]),
				)
				.mockReturnValue(chain([]));
			adherenceLogModel.find.mockReturnValue(chain([]));
			patientModel.findByIdAndUpdate.mockResolvedValue({} as any);

			expect(await service.refreshAdherenceRates()).toBe(2);
			expect(patientModel.findByIdAndUpdate).toHaveBeenCalledTimes(2);
			expect(patientModel.findByIdAndUpdate).toHaveBeenCalledWith('p2', {
				$set: expect.objectContaining({ adherenceRate: 0 }),
			});
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
			// Tuesday is over with its evening dose not taken, even though it
			// can still be confirmed late.
			expect(days[1]).toMatchObject({
				taken: false,
				takenDoses: 1,
				scheduledDoses: 2,
			});
			// Today has nothing taken yet, so it stays open.
			expect(days[2]).toMatchObject({ taken: null, scheduledDoses: 2 });
			expect(days[6]).toMatchObject({ label: 'S', taken: null });
		});
	});

	describe('medicationMonthHistory', () => {
		it('leaves days before the medication was added blank', async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2026-06-10T12:00:00'));
			const now = new Date();
			const medication = {
				...morningMedication(),
				startDate: new Date('2026-06-05T00:00:00'),
				createdAt: new Date('2026-06-05T07:00:00'),
			};
			medicationModel.find.mockReturnValue(chain([medication]));
			// Jun 5–7 taken; Jun 8 and 9 over and not taken; Jun 10 is today.
			adherenceLogModel.find.mockReturnValue(
				chain([3, 4, 5].map((d) => takenMorning(medication._id, now, d))),
			);

			const history = await service.medicationMonthHistory(
				'u1',
				medication._id.toString(),
				now,
			);

			const takenOn = (day: number) => history.logs[day - 1].taken;
			expect([1, 2, 3, 4].map(takenOn)).toEqual([null, null, null, null]);
			expect([5, 6, 7].map(takenOn)).toEqual([true, true, true]);
			expect([8, 9].map(takenOn)).toEqual([false, false]);
			expect([10, 11].map(takenOn)).toEqual([null, null]);
			expect(history.adherenceRate).toBe(60); // 3 of 5 doses
		});
	});

	describe('recordMissedDoses', () => {
		it('writes a missed log for each unconfirmed dose past its window', async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2026-06-10T12:00:00'));
			const now = new Date();
			const medication = morningMedication();
			medicationModel.distinct.mockReturnValue({
				setOptions: vi.fn().mockResolvedValue(['u1']),
			} as any);
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
			medicationModel.distinct.mockReturnValue({
				setOptions: vi.fn().mockResolvedValue(['u1']),
			} as any);
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
