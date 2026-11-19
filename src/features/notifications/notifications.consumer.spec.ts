import { getQueueToken } from '@nestjs/bullmq';
import { getModelToken } from '@nestjs/mongoose';
import { type Mocked, TestBed } from '@suites/unit';
import type { Queue } from 'bullmq';
import { Types } from 'mongoose';
import { mockDeep } from 'vitest-mock-extended';
import { ExtClientAIService } from '@/features/client/ai/ai-ext.service';
import { PushNotificationType } from './dto';
import { AugurNotification } from './entities/notification.entity';
import {
	fallbackReminderText,
	NotificationsConsumer,
} from './notifications.consumer';
import { PushService } from './push/push.service';

describe('fallbackReminderText', () => {
	it('greets by first name and lists each goal once', () => {
		expect(
			fallbackReminderText('Ama Mensah', [
				{ goal: 'Take Metformin', targetName: 'Metformin' },
				{ goal: 'Take Lisinopril', targetName: 'Lisinopril' },
				{ goal: 'Take Metformin', targetName: 'Metformin' },
			]),
		).toBe('Hi Ama, a reminder: Take Metformin; Take Lisinopril.');
	});

	it('falls back to the target name when a goal is missing', () => {
		expect(
			fallbackReminderText('Kofi', [{ goal: '', targetName: 'Walk' }]),
		).toBe('Hi Kofi, a reminder: Walk.');
	});

	it('still reads well with no name and nothing to list', () => {
		expect(fallbackReminderText(undefined, [])).toBe(
			'You have a health reminder from Yelima.',
		);
	});
});

describe('NotificationsConsumer with the AI not configured', () => {
	let consumer: NotificationsConsumer;
	let pushService: Mocked<PushService>;
	let extClientAiService: Mocked<ExtClientAIService>;

	beforeEach(async () => {
		vi.stubEnv('GOOGLE_API_KEY', '');
		const { unit, unitRef } = await TestBed.solitary(NotificationsConsumer)
			.mock(getQueueToken(AugurNotification.name))
			.final(mockDeep<Queue>())
			.compile();
		consumer = unit;
		pushService = unitRef.get(PushService);
		extClientAiService = unitRef.get(ExtClientAIService);

		// Loosely typed: Mocked<Model<...>> is too deep for the compiler.
		const notificationModel = unitRef.get(
			getModelToken(AugurNotification.name),
		) as unknown as { findById: ReturnType<typeof vi.fn> };
		const notificationId = new Types.ObjectId().toString();
		notificationModel.findById.mockReturnValue({
			populate: vi.fn().mockResolvedValue({
				id: notificationId,
				patient: {
					id: 'patient-1',
					userId: 'user-1',
					name: 'Ama Mensah',
					language: 'Twi',
					phoneNumber: '+233200000000',
				},
			}),
		} as any);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('still sends the reminder, with plain text instead of AI text', async () => {
		await consumer.notifyPatient({
			notificationId: 'n-1',
			groupedNotifications: [
				{
					goal: 'Take Metformin',
					targetName: 'Metformin',
					targetType: 'medication',
				},
			],
		});

		expect(pushService.sendAugurNotification).toHaveBeenCalledWith({
			userId: 'user-1',
			title: 'Yelima AI',
			body: 'Hi Ama, a reminder: Take Metformin.',
			payload: { notification_type: PushNotificationType.MEDICATION },
		});
		expect(extClientAiService.persistData).toHaveBeenCalledWith(
			expect.objectContaining({
				content: 'Hi Ama, a reminder: Take Metformin.',
			}),
			{ configurable: { thread_id: 'user-1' } },
			'Twi',
			expect.objectContaining({ userId: 'user-1' }),
		);
	});

	it('falls back to plain text when the AI is configured but its call fails', async () => {
		vi.stubEnv('GOOGLE_API_KEY', 'test-key');
		const invoke = vi.fn().mockRejectedValue(new Error('429 from Gemini'));
		(consumer as any).llmInstance = { invoke };

		await consumer.notifyPatient({
			notificationId: 'n-1',
			groupedNotifications: [
				{ goal: 'Check your BP', targetName: 'BP', targetType: 'vitals' },
			],
		});

		expect(invoke).toHaveBeenCalled();
		expect(pushService.sendAugurNotification).toHaveBeenCalledWith({
			userId: 'user-1',
			title: 'Yelima AI',
			body: 'Hi Ama, a reminder: Check your BP.',
			payload: { notification_type: PushNotificationType.AI_CHAT },
		});
	});
});
