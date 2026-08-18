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
			dhVectorsService.create.mockResolvedValue({} as any);

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
			expect(dhVectorsService.create).toHaveBeenCalledWith(
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
			dhVectorsService.findAll.mockResolvedValue([]);

			const mockMedId = new Types.ObjectId();
			const mockMedication = {
				_id: mockMedId,
				name: 'Lisinopril',
				qdrantId: 'qdrant-uuid-1',
			};
			medicationModel.findOneAndUpdate.mockResolvedValue(mockMedication as any);
			dhVectorsService.create.mockResolvedValue({} as any);

			const filters = { userId: 'u1', patient: 'p1', name: 'Lisinopril' };
			const dto = { name: 'Lisinopril', dosage: '10mg' };

			const result = await service.upsertMedication(filters, dto as any);

			expect(dhVectorsService.findAll).toHaveBeenCalledWith({
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
			dhVectorsService.findAll.mockResolvedValue([
				{ item: { documentId: existingDocId } } as any,
			]);

			const mockMedication = {
				_id: new Types.ObjectId(existingDocId),
				name: 'Lisinopril',
				qdrantId: 'qdrant-uuid-2',
			};
			medicationModel.findOneAndUpdate.mockResolvedValue(mockMedication as any);
			dhVectorsService.create.mockResolvedValue({} as any);

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
			};

			medicationModel.findOne.mockResolvedValue(mockMedication as any);
			notificationsService.update.mockResolvedValue({} as any);
			dhVectorsService.create.mockResolvedValue({} as any);

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
			adherencesService.removeLogsByTargetName.mockResolvedValue({} as any);
			adherencesService.removePatternsByTargetName.mockResolvedValue({} as any);
			dhVectorsService.deleteByDocumentId.mockResolvedValue({} as any);
			medicationModel.findByIdAndDelete.mockResolvedValue({} as any);

			await service.remove(mockMedId, 'u1');

			expect(notificationsService.remove).toHaveBeenCalledWith('notif-99');
			expect(adherencesService.removeLogsByTargetName).toHaveBeenCalledWith(
				'u1',
				'Aspirin',
			);
			expect(adherencesService.removePatternsByTargetName).toHaveBeenCalledWith(
				'u1',
				'Aspirin',
			);
			expect(dhVectorsService.deleteByDocumentId).toHaveBeenCalledWith(
				mockMedId,
			);
			expect(medicationModel.findByIdAndDelete).toHaveBeenCalledWith(mockMedId);
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
