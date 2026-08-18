import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { type Mocked, TestBed } from '@suites/unit';
import type { Queue } from 'bullmq';
import { Model, Types } from 'mongoose';
import { DhVectorsService } from '../dh-vectors/dh-vectors.service';
import { DHDocumentType } from '../dh-vectors/dto';
import { AugurNotification } from './entities/notification.entity';
import { NotificationsService } from './notifications.service';
import { PushService } from './push/push.service';

describe('NotificationsService', () => {
	let service: NotificationsService;
	let notificationModel: Mocked<Model<AugurNotification>>;
	let notificationQueue: Mocked<Queue>;
	let dhVectorsService: Mocked<DhVectorsService>;
	let pushService: Mocked<PushService>;

	beforeAll(async () => {
		const { unit, unitRef } = await TestBed.solitary(NotificationsService)
			.mock(getQueueToken(AugurNotification.name))
			.final()
			.compile();

		service = unit;
		notificationModel = unitRef.get(getModelToken(AugurNotification.name));
		dhVectorsService = unitRef.get(DhVectorsService);
		pushService = unitRef.get(PushService);
	});

	beforeEach(() => {
		vi.clearAllMocks();
		notificationQueue = (service as any).notificationQueue;
	});

	it('should be defined', () => {
		expect(service).toBeDefined();
	});

	describe('create', () => {
		it('should create notification, save vector embedding, and schedule queue job', async () => {
			const mockId = new Types.ObjectId();
			const mockNotification = {
				_id: mockId,
				userId: 'user-1',
				patient: 'patient-1',
				qdrantId: 'qdrant-id-123',
				queueJobId: 'job-id-123',
				startDate: new Date(),
				timezone: 'Africa/Accra',
				frequency: { repeatEvery: 1, repetitionType: 'daily' },
				toJSON: vi.fn().mockReturnValue({ _id: mockId }),
				save: vi.fn().mockResolvedValue(true),
			};

			notificationModel.create.mockResolvedValue(mockNotification as any);
			dhVectorsService.create.mockResolvedValue({} as any);
			notificationQueue.getJob.mockResolvedValue(null as any);
			notificationQueue.getJobScheduler.mockResolvedValue(null as any);
			notificationQueue.upsertJobScheduler.mockResolvedValue({} as any);

			const dto = {
				userId: 'user-1',
				patient: 'patient-1',
				goal: 'Take blood pressure check',
				startDate: new Date(),
				frequency: { repeatEvery: 1, repetitionType: 'daily' as const },
			};

			const result = await service.create(dto as any);

			expect(notificationModel.create).toHaveBeenCalled();
			expect(dhVectorsService.create).toHaveBeenCalledWith(
				expect.objectContaining({
					documentType: DHDocumentType.NOTIFICATION,
					documentId: mockId.toString(),
					userId: 'user-1',
				}),
			);
			expect(result).toEqual(mockId);
		});
	});

	describe('findOne', () => {
		it('should find notification by id and populate patient details', async () => {
			const mockQueryChain = {
				populate: vi.fn().mockResolvedValue({ _id: 'notif-1' }),
			};
			notificationModel.findById.mockReturnValue(mockQueryChain as any);

			const result = await service.findOne('notif-1');

			expect(notificationModel.findById).toHaveBeenCalledWith('notif-1');
			expect(result).toEqual({ _id: 'notif-1' });
		});

		it('should throw NotFoundException if notification does not exist', async () => {
			const mockQueryChain = {
				populate: vi.fn().mockResolvedValue(null),
			};
			notificationModel.findById.mockReturnValue(mockQueryChain as any);

			await expect(service.findOne('invalid-id')).rejects.toThrow(
				NotFoundException,
			);
		});
	});

	describe('update', () => {
		it('should update notification and update queue job schedule', async () => {
			const mockNotification = {
				_id: 'notif-1',
				userId: 'u1',
				patient: 'p1',
				qdrantId: 'qdrant-1',
				queueJobId: 'job-1',
				startDate: new Date(),
				frequency: { repeatEvery: 1, repetitionType: 'daily' },
				toJSON: vi.fn().mockReturnValue({ _id: 'notif-1' }),
				save: vi.fn().mockResolvedValue(true),
			};

			notificationModel.findByIdAndUpdate.mockResolvedValue(
				mockNotification as any,
			);
			dhVectorsService.create.mockResolvedValue({} as any);
			notificationQueue.getJob.mockResolvedValue(null as any);
			notificationQueue.getJobScheduler.mockResolvedValue(null as any);
			notificationQueue.upsertJobScheduler.mockResolvedValue({} as any);

			const result = await service.update('notif-1', {
				goal: 'Updated Goal',
			} as any);

			expect(notificationModel.findByIdAndUpdate).toHaveBeenCalledWith(
				'notif-1',
				{ goal: 'Updated Goal' },
				{ returnDocument: 'after' },
			);
			expect(result).toBe('notif-1');
		});

		it('should throw NotFoundException if notification to update does not exist', async () => {
			notificationModel.findByIdAndUpdate.mockResolvedValue(null);

			await expect(
				service.update('invalid-id', { goal: 'Test' } as any),
			).rejects.toThrow(NotFoundException);
		});
	});

	describe('remove', () => {
		it('should remove notification and cancel BullMQ job scheduler', async () => {
			const mockNotification = {
				_id: 'notif-1',
				queueJobId: 'job-123',
			};

			notificationModel.findByIdAndDelete.mockResolvedValue(
				mockNotification as any,
			);
			notificationQueue.getJob.mockResolvedValue(null as any);
			notificationQueue.getJobScheduler.mockResolvedValue({
				key: 'job-123',
			} as any);
			notificationQueue.removeJobScheduler.mockResolvedValue(true);

			await service.remove('notif-1');

			expect(notificationModel.findByIdAndDelete).toHaveBeenCalledWith(
				'notif-1',
			);
			expect(notificationQueue.removeJobScheduler).toHaveBeenCalledWith(
				'job-123',
			);
		});
	});

	describe('purgeNotifications', () => {
		it('should purge all notifications for a patientId', async () => {
			const mockNotifications = [{ _id: 'notif-1' }, { _id: 'notif-2' }];
			const mockQueryChain = {
				select: vi.fn().mockResolvedValue(mockNotifications),
			};
			notificationModel.find.mockReturnValue(mockQueryChain as any);

			notificationModel.findByIdAndDelete.mockResolvedValue({
				queueJobId: 'job-1',
			} as any);
			notificationQueue.getJob.mockResolvedValue(null as any);
			notificationQueue.getJobScheduler.mockResolvedValue(null as any);

			await service.purgeNotifications('patient-123');

			expect(notificationModel.find).toHaveBeenCalledWith({
				patient: 'patient-123',
			});
			expect(notificationModel.findByIdAndDelete).toHaveBeenCalledTimes(2);
		});
	});

	describe('fcm tokens', () => {
		it('addFcmToken should call pushService.addFcmToken', async () => {
			await service.addFcmToken(
				{ fcmToken: 'tok-123' } as any,
				{
					userId: 'u1',
				} as any,
			);

			expect(pushService.addFcmToken).toHaveBeenCalledWith(
				{ fcmToken: 'tok-123' },
				{ userId: 'u1' },
			);
		});

		it('removeFcmToken should call pushService.removeFcmToken', async () => {
			await service.removeFcmToken({ fcmToken: 'tok-123' } as any, 'u1');

			expect(pushService.removeFcmToken).toHaveBeenCalledWith(
				{ fcmToken: 'tok-123' },
				'u1',
			);
		});
	});
});
