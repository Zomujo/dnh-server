import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { type Mocked, TestBed } from '@suites/unit';
import { Model, Types } from 'mongoose';
import { AdherencesService } from '@/features/adherences/adherences.service';
import { DhVectorsService } from '../dh-vectors/dh-vectors.service';
import { DHDocumentType } from '../dh-vectors/dto';
import { NotificationsService } from '../notifications/notifications.service';
import { Medication } from './entities/medication.entity';
import { MedicationsService } from './medications.service';

describe('MedicationsService', () => {
	let service: MedicationsService;
	let medicationModel: Mocked<Model<Medication>>;
	let dhVectorsService: Mocked<DhVectorsService>;
	let adherencesService: Mocked<AdherencesService>;
	let notificationsService: Mocked<NotificationsService>;

	beforeAll(async () => {
		const { unit, unitRef } =
			await TestBed.solitary(MedicationsService).compile();

		service = unit;
		medicationModel = unitRef.get(getModelToken(Medication.name));
		dhVectorsService = unitRef.get(DhVectorsService);
		adherencesService = unitRef.get(AdherencesService);
		notificationsService = unitRef.get(NotificationsService);
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	describe('create', () => {
		it('should create medication, create notification reminders, and create vector embedding', async () => {
			notificationsService.create.mockResolvedValue('notif-123' as any);

			const mockMedicationId = new Types.ObjectId();
			const mockCreatedMedication = {
				_id: mockMedicationId,
				name: 'Metformin',
				dosage: '500mg',
			};
			medicationModel.create.mockResolvedValue(mockCreatedMedication as any);
			dhVectorsService.index.mockResolvedValue({} as any);

			const dto = {
				name: 'Metformin',
				dosage: '500mg',
				morning: {
					time: { hour: 8, minutes: 0, timeDesignators: 'AM' as const },
				},
			};

			const result = await service.create(dto as any, 'user-1', 'patient-1');

			expect(notificationsService.create).toHaveBeenCalledWith(
				expect.objectContaining({
					targetName: 'Metformin',
					userId: 'user-1',
					patient: 'patient-1',
				}),
			);

			expect(medicationModel.create).toHaveBeenCalled();
			expect(dhVectorsService.index).toHaveBeenCalledWith(
				expect.objectContaining({
					documentType: DHDocumentType.MEDICATION,
					documentId: mockMedicationId.toString(),
					userId: 'user-1',
					patient: 'patient-1',
				}),
			);
			expect(result).toBe(mockMedicationId.toString());
		});
	});

	describe('upsertMedication', () => {
		it('should upsert medication with exact regex name match when vector search misses', async () => {
			dhVectorsService.findSimilar.mockResolvedValue([]);

			const mockMedId = new Types.ObjectId();
			const mockMedication = {
				_id: mockMedId,
				name: 'Lisinopril',
				qdrantId: 'qdrant-uuid-1',
			};
			medicationModel.findOneAndUpdate.mockResolvedValue(mockMedication as any);
			dhVectorsService.index.mockResolvedValue({} as any);

			const filters = { userId: 'u1', patient: 'p1', name: 'Lisinopril' };
			const dto = { name: 'Lisinopril', dosage: '10mg' };

			const result = await service.upsertMedication(filters, dto as any);

			expect(dhVectorsService.findSimilar).toHaveBeenCalledWith({
				userId: 'u1',
				patient: 'p1',
				documentType: DHDocumentType.MEDICATION,
				query: 'lisinopril',
			});

			expect(medicationModel.findOneAndUpdate).toHaveBeenCalledWith(
				{
					name: expect.any(RegExp),
					patient: 'p1',
				},
				expect.any(Object),
				{ returnDocument: 'after', upsert: true },
			);

			expect(result).toEqual(mockMedId);
		});

		it('should upsert medication by documentId when vector search hits', async () => {
			const existingDocId = new Types.ObjectId().toString();
			dhVectorsService.findSimilar.mockResolvedValue([
				{ item: { documentId: existingDocId } } as any,
			]);

			const mockMedication = {
				_id: new Types.ObjectId(existingDocId),
				name: 'Lisinopril',
				qdrantId: 'qdrant-uuid-2',
			};
			medicationModel.findOneAndUpdate.mockResolvedValue(mockMedication as any);
			dhVectorsService.index.mockResolvedValue({} as any);

			const filters = { userId: 'u1', patient: 'p1', name: 'Lisinopril' };
			const dto = { name: 'Lisinopril' };

			await service.upsertMedication(filters, dto as any);

			expect(medicationModel.findOneAndUpdate).toHaveBeenCalledWith(
				{ _id: new Types.ObjectId(existingDocId) },
				expect.any(Object),
				expect.any(Object),
			);
		});
	});

	describe('update', () => {
		it('should update medication and update notification schedule', async () => {
			const mockMedId = new Types.ObjectId().toString();
			const mockMedication = {
				_id: mockMedId,
				userId: 'u1',
				patient: 'p1',
				name: 'Am萨洛平',
				morning: { notification: 'notif-1' },
				save: vi.fn().mockResolvedValue(true),
				set(key: string, value: unknown) {
					(this as any)[key] = value;
				},
			};

			medicationModel.findOne.mockResolvedValue(mockMedication as any);
			notificationsService.update.mockResolvedValue({} as any);
			dhVectorsService.index.mockResolvedValue({} as any);

			const dto = {
				dosage: '10mg',
				morning: {
					time: { hour: 9, minutes: 0, timeDesignators: 'AM' as const },
				},
			};

			const result = await service.update(mockMedId, dto as any, 'u1');

			expect(notificationsService.update).toHaveBeenCalledWith('notif-1', {
				startDate: expect.any(Date),
			});
			expect(mockMedication.save).toHaveBeenCalled();
			expect(result).toBe(mockMedId);
		});

		const time = (hour: number, timeDesignators: 'AM' | 'PM') => ({
			time: { hour, minutes: 0, timeDesignators },
		});
		const fakeMedication = (fields: Record<string, unknown>) => ({
			_id: new Types.ObjectId().toString(),
			userId: 'u1',
			patient: 'p1',
			name: 'Metformin',
			frequency: { repeatEvery: 3, repetitionType: 'daily' },
			save: vi.fn().mockResolvedValue(true),
			set(key: string, value: unknown) {
				(this as any)[key] = value;
			},
			...fields,
		});

		it('removes a section sent as null, cancels its reminder and recounts doses', async () => {
			const medication = fakeMedication({
				morning: { ...time(8, 'AM'), notification: 'n-morning' },
				afternoon: { ...time(1, 'PM'), notification: 'n-afternoon' },
				evening: { ...time(8, 'PM'), notification: 'n-evening' },
			});
			medicationModel.findOne.mockResolvedValue(medication as any);
			notificationsService.remove.mockResolvedValue({} as any);
			dhVectorsService.index.mockResolvedValue({} as any);

			await service.update(medication._id, { afternoon: null } as any, 'u1');

			expect(notificationsService.remove).toHaveBeenCalledWith('n-afternoon');
			expect((medication as any).afternoon).toBeUndefined();
			expect((medication as any).morning.notification).toBe('n-morning');
			expect(medication.frequency.repeatEvery).toBe(2);
		});

		it('counts every remaining section, not just the edited one', async () => {
			const medication = fakeMedication({
				morning: { ...time(8, 'AM'), notification: 'n-morning' },
				evening: { ...time(8, 'PM'), notification: 'n-evening' },
			});
			medicationModel.findOne.mockResolvedValue(medication as any);
			notificationsService.update.mockResolvedValue({} as any);
			dhVectorsService.index.mockResolvedValue({} as any);

			await service.update(
				medication._id,
				{ morning: time(9, 'AM') } as any,
				'u1',
			);

			expect(medication.frequency.repeatEvery).toBe(2);
			// The edited section keeps its link to the existing reminder.
			expect((medication as any).morning).toMatchObject({
				time: { hour: 9 },
				notification: 'n-morning',
			});
		});

		it('leaves sections that are absent from the request untouched', async () => {
			const medication = fakeMedication({
				morning: { ...time(8, 'AM'), notification: 'n-morning' },
			});
			medicationModel.findOne.mockResolvedValue(medication as any);
			dhVectorsService.index.mockResolvedValue({} as any);

			await service.update(medication._id, { dosage: '1g' } as any, 'u1');

			expect(notificationsService.remove).not.toHaveBeenCalled();
			expect(notificationsService.update).not.toHaveBeenCalled();
			expect((medication as any).morning.notification).toBe('n-morning');
			expect(medication.frequency.repeatEvery).toBe(1);
		});

		it('keeps the schedule it replaces, so earlier days keep their doses', async () => {
			const createdAt = new Date('2026-10-20T09:00:00');
			const medication = fakeMedication({
				createdAt,
				morning: { ...time(8, 'AM'), notification: 'n-morning' },
			});
			medicationModel.findOne.mockResolvedValue(medication as any);
			notificationsService.create.mockResolvedValue('n-afternoon' as any);
			dhVectorsService.index.mockResolvedValue({} as any);

			await service.update(
				medication._id,
				{ afternoon: time(1, 'PM') } as any,
				'u1',
			);

			expect((medication as any).scheduleHistory).toEqual([
				{ effectiveFrom: createdAt, morning: time(8, 'AM').time },
				{
					effectiveFrom: expect.any(Date),
					morning: time(8, 'AM').time,
					afternoon: time(1, 'PM').time,
				},
			]);
		});

		it('records no version when no dose time changes', async () => {
			const medication = fakeMedication({
				morning: { ...time(8, 'AM'), notification: 'n-morning' },
			});
			medicationModel.findOne.mockResolvedValue(medication as any);
			notificationsService.update.mockResolvedValue({} as any);
			dhVectorsService.index.mockResolvedValue({} as any);

			await service.update(
				medication._id,
				{ dosage: '1g', morning: time(8, 'AM') } as any,
				'u1',
			);

			expect((medication as any).scheduleHistory).toBeUndefined();
		});

		it('dates a schedule saved without a version from its save, even on an edit that changes no dose', async () => {
			const createdAt = new Date('2026-10-20T09:00:00');
			const savedByAi = new Date('2026-10-25T12:00:00');
			const medication = fakeMedication({
				createdAt,
				updatedAt: savedByAi,
				// The AI memory upsert added an evening dose without a version.
				morning: { ...time(8, 'AM'), notification: 'n-morning' },
				evening: { ...time(8, 'PM'), notification: 'n-evening' },
				scheduleHistory: [
					{ effectiveFrom: createdAt, morning: time(8, 'AM').time },
				],
			});
			medicationModel.findOne.mockResolvedValue(medication as any);
			dhVectorsService.index.mockResolvedValue({} as any);

			await service.update(medication._id, { notes: 'with food' } as any, 'u1');

			expect((medication as any).scheduleHistory).toEqual([
				{ effectiveFrom: createdAt, morning: time(8, 'AM').time },
				{
					effectiveFrom: savedByAi,
					morning: time(8, 'AM').time,
					evening: time(8, 'PM').time,
				},
			]);
		});

		it('should throw NotFoundException if medication to update does not exist', async () => {
			medicationModel.findOne.mockResolvedValue(null);

			await expect(
				service.update('invalid-id', {} as any, 'u1'),
			).rejects.toThrow(NotFoundException);
		});
	});

	describe('remove', () => {
		it('should remove medication, cancel notifications, adherence logs, and vector embeddings', async () => {
			const mockMedId = new Types.ObjectId().toString();
			const mockMedication = {
				_id: mockMedId,
				userId: 'u1',
				name: 'Aspirin',
				morning: { notification: 'notif-99' },
			};

			medicationModel.findOne.mockResolvedValue(mockMedication as any);
			notificationsService.remove.mockResolvedValue({} as any);
			medicationModel.exists.mockResolvedValue(null);
			adherencesService.removeMedicationHistory.mockResolvedValue({} as any);
			dhVectorsService.deleteByDocumentId.mockResolvedValue({} as any);
			medicationModel.findByIdAndDelete.mockResolvedValue({} as any);

			await service.remove(mockMedId, 'u1');

			expect(notificationsService.remove).toHaveBeenCalledWith('notif-99');
			expect(adherencesService.removeMedicationHistory).toHaveBeenCalledWith(
				'u1',
				mockMedId,
				'Aspirin',
				false,
			);
			expect(dhVectorsService.deleteByDocumentId).toHaveBeenCalledWith(
				mockMedId,
			);
			expect(medicationModel.findByIdAndDelete).toHaveBeenCalledWith(mockMedId);
		});
	});

	describe("remove keeps another same-named medication's history", () => {
		it('tells adherences the name is still in use', async () => {
			const id = new Types.ObjectId().toString();
			medicationModel.findOne.mockResolvedValue({
				_id: id,
				userId: 'u1',
				name: 'Aspirin',
			} as any);
			medicationModel.exists.mockResolvedValue({ _id: 'other' } as any);
			dhVectorsService.deleteByDocumentId.mockResolvedValue({} as any);
			medicationModel.findByIdAndDelete.mockResolvedValue({} as any);

			await service.remove(id, 'u1');

			expect(medicationModel.exists).toHaveBeenCalledWith({
				userId: 'u1',
				_id: { $ne: id },
				name: /^Aspirin$/i,
			});
			expect(adherencesService.removeMedicationHistory).toHaveBeenCalledWith(
				'u1',
				id,
				'Aspirin',
				true,
			);
		});
	});

	describe('findByUserId', () => {
		it('should query medications for user with pagination', async () => {
			const mockMeds = [{ name: 'Aspirin' }];
			const mockQueryChain = {
				skip: vi.fn().mockReturnThis(),
				limit: vi.fn().mockReturnThis(),
				sort: vi.fn().mockReturnThis(),
				select: vi.fn().mockResolvedValue(mockMeds),
			};
			medicationModel.find.mockReturnValue(mockQueryChain as any);

			const result = await service.findByUserId('u1', 0, 10);

			expect(medicationModel.find).toHaveBeenCalledWith({ userId: 'u1' });
			expect(result).toEqual(mockMeds);
		});
	});

	describe('findBySchedule', () => {
		it('should query medications scheduled for morning', async () => {
			const mockMeds = [{ name: 'Metformin', morning: {} }];
			const mockQueryChain = {
				select: vi.fn().mockReturnThis(),
				lean: vi.fn().mockResolvedValue(mockMeds),
			};
			medicationModel.find.mockReturnValue(mockQueryChain as any);

			const result = await service.findBySchedule('u1', 'morning');

			expect(medicationModel.find).toHaveBeenCalledWith({
				userId: 'u1',
				morning: { $exists: true, $ne: null },
			});
			// What today's list needs to plan the day's doses.
			expect(mockQueryChain.select).toHaveBeenCalledWith(
				expect.arrayContaining(['startDate', 'createdAt', 'scheduleHistory']),
			);
			expect(result).toEqual(mockMeds);
		});
	});

	describe('countBySchedules', () => {
		it('should return grouped counts by morning/afternoon/evening', async () => {
			medicationModel.aggregate.mockResolvedValue([
				{ _id: null, morning: 2, afternoon: 1, evening: 3 },
			] as any);

			const counts = await service.countBySchedules('u1');

			expect(counts).toEqual({ morning: 2, afternoon: 1, evening: 3 });
		});

		it('should return zero counts when patient has no medications', async () => {
			medicationModel.aggregate.mockResolvedValue([]);

			const counts = await service.countBySchedules('u1');

			expect(counts).toEqual({ morning: 0, afternoon: 0, evening: 0 });
		});
	});

	describe('removeByUserId', () => {
		it('should delete all medications for a user', async () => {
			medicationModel.deleteMany.mockResolvedValue({
				deletedCount: 4,
			} as any);

			const result = await service.removeByUserId('u1');

			expect(medicationModel.deleteMany).toHaveBeenCalledWith({
				userId: 'u1',
			});
			expect(result).toEqual({ deletedCount: 4 });
		});
	});
});
