import { AIMessage } from '@langchain/core/messages';
import { PromptTemplate } from '@langchain/core/prompts';
import type { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Job, Queue } from 'bullmq';
import { addMilliseconds, addMinutes, subMinutes } from 'date-fns';
import { Model, Types } from 'mongoose';
import {
	createGeminiChatModel,
	isAiConfigured,
} from '@/common/utils/ai-features';
import { TargetType } from '@/features/adherences/dto/target-type.enum';
import { AUGURY_PROMPT } from '@/features/client/ai/agents/augury/state';
import { ExtClientAIService } from '@/features/client/ai/ai-ext.service';
import { getUserTimezone } from '@/features/client/ai/states';
import { IConfig } from '@/features/client/dto/create.dto';
import { Frequency, PushNotificationType, RepetitionType } from './dto';
import { AugurNotification } from './entities/notification.entity';
import { PushService } from './push/push.service';

@Processor(AugurNotification.name)
export class NotificationsConsumer extends WorkerHost {
	private logger = new Logger(NotificationsConsumer.name);
	// Built on first AI-written reminder: the (retired) AI may be off.
	private llmInstance?: ChatGoogleGenerativeAI;
	private get llm() {
		this.llmInstance ??= createGeminiChatModel({ temperature: 0.7 });
		return this.llmInstance;
	}

	constructor(
		@InjectModel(AugurNotification.name)
		private notificationModel: Model<AugurNotification>,
		private readonly pushService: PushService,
		private readonly extClientAiService: ExtClientAIService,
		@InjectQueue(AugurNotification.name)
		private readonly notificationQueue: Queue,
	) {
		super();
	}

	async process(job: Job<any, any, string>) {
		switch (job.name) {
			case 'notify': {
				await this.announceActivity({ ...job.data });
				break;
			}
		}
	}

	async announceActivity(data: { notification: AugurNotification }) {
		const now = new Date();
		const notifications = await this.notificationModel
			.find({
				userId: data.notification.userId,
				toBeNotifiedAt: { $gte: subMinutes(now, 1), $lte: addMinutes(now, 10) },
			})
			.select('goal targetName targetType')
			.lean();

		if (notifications.length > 0) {
			await this.notifyPatient({
				notificationId: data.notification.id,
				groupedNotifications: notifications,
			});
		}

		await Promise.allSettled(
			notifications.map((n) =>
				this.updateNotification({
					notificationId: n._id.toString(),
					isPrimary: data.notification.id === n._id.toString(),
				}),
			),
		);
	}

	async notifyPatient(data: {
		notificationId: string;
		groupedNotifications: {
			goal: string;
			targetName: string;
			targetType: string;
		}[];
	}) {
		const notification = await this.notificationModel
			.findById(data.notificationId)
			.populate({
				path: 'patient',
				select: 'userId name language timezone phoneNumber',
			});

		if (!notification) {
			throw new NotFoundException('Notification not found');
		}
		const goals = data.groupedNotifications.map((not) => not.goal);
		this.logger.log('goals', { goals });

		const text = await this.composeReminder(
			notification,
			data.groupedNotifications,
		);

		const user = {
			patientId: notification.patient.id,
			userId: notification.patient.userId,
			name: notification.patient.name,
			phoneNumber: notification.patient.phoneNumber,
		};

		const config = {
			configurable: { thread_id: notification.patient.userId },
		} as IConfig;

		const messageId = new Types.ObjectId();
		const aiMessage = new AIMessage({
			id: messageId.toString(),
			content: text,
			additional_kwargs: {
				timestamp: new Date(),
				userId: notification.patient.userId,
				chatType: 'text',
			},
		});

		await this.extClientAiService.persistData(
			aiMessage,
			config,
			notification.patient.language,
			user,
		);

		// const adherenceLogIds = await Promise.all(
		// 	data.groupedNotifications.map(async (not) => {
		// 		const adherenceLog = await this.adherenceLogModel.create({
		// 			userId: notification.patient.userId,
		// 			patient: notification.patient.id,
		// 			targetType: not.targetType,
		// 			targetName: not.targetName,
		// 			taken: false,
		// 			status: 'missed',
		// 		});
		// 		return adherenceLog._id as string;
		// 	}),
		// );
		//
		// const params = new URLSearchParams();
		// adherenceLogIds.forEach((id) => params.append('id', id));
		// const choiceEndpoint = `/chronic-care/doctors/medications/receive-choice?${params.toString()}`;

		// The message is also saved to the AI chat above. A batch of only
		// medication reminders opens Medications; anything else is a chat
		// message the patient reads in the AI chat.
		// Lower-cased: older reminders were saved with any casing.
		const onlyMedications =
			data.groupedNotifications.length > 0 &&
			data.groupedNotifications.every(
				(not) => not.targetType?.toLowerCase() === TargetType.MEDICATION,
			);
		await this.pushService.sendAugurNotification({
			userId: notification.patient.userId,
			title: 'Yelima AI',
			body: text,
			payload: {
				notification_type: onlyMedications
					? PushNotificationType.MEDICATION
					: PushNotificationType.AI_CHAT,
			},
		});

		// payload: {
		// 	actionId: 'chronic_actions',
		// 	notification_type: 'actionBtns',
		// 	actionBtn1Display: 'Yes',
		// 	actionBtn1Payload: 'yes',
		// 	actionBtn1Endpoint: choiceEndpoint,
		// 	actionBtn2Display: 'No',
		// 	actionBtn2Payload: 'no',
		// 	actionBtn2Endpoint: choiceEndpoint,
		// },

		// const timestamp = new Date();
		// await this.chronicCareChatModel.insertMany([
		// 	{
		// 		userId: notification.patient.userId,
		// 		role: ChronicCareMessageRole.ASSISTANT,
		// 		content: output.outResponse.text.toString(),
		// 		createdAt: addSeconds(timestamp, 1),
		// 		updatedAt: addSeconds(timestamp, 1),
		// 	},
		// ]);
		this.logger.log('Ai Output: ' + text);
		return;
	}

	/**
	 * The reminder text: AI-written in the patient's language and tone when
	 * the (retired) AI is configured, else (or if the AI call fails) a plain
	 * template, so reminders still go out.
	 */
	private async composeReminder(
		notification: AugurNotification,
		groupedNotifications: { goal: string; targetName: string }[],
	): Promise<string> {
		if (!isAiConfigured()) {
			return fallbackReminderText(
				notification.patient.name,
				groupedNotifications,
			);
		}
		try {
			const promptTemplate = PromptTemplate.fromTemplate(AUGURY_PROMPT);
			const prompt = await promptTemplate.invoke({
				notificationType: notification.notificationType,
				patientName: notification.patient.name,
				patientLanguage: notification.patient.language ?? 'English',
				patientTimezone: getUserTimezone(
					notification.patient.timezone ?? 'Africa/Accra',
				),
				tone: notification.tone,
				channel: notification.channel,
				characterLimit: notification.characterLimit,
				goals: groupedNotifications.map((not) => not.goal),
				priority: notification.priority,
				constraints: notification.constraints,
			});
			const output = await this.llm.invoke(prompt);
			const text = output.content.toString().trim();
			if (text) return text;
		} catch (error) {
			this.logger.warn(
				`AI reminder text failed, sending the plain one: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		return fallbackReminderText(
			notification.patient.name,
			groupedNotifications,
		);
	}

	async updateNotification(data: {
		notificationId: string;
		isPrimary: boolean;
	}) {
		const notification = await this.notificationModel.findById(
			data.notificationId,
		);

		if (!notification) {
			throw new NotFoundException('Notification not found');
		}

		const scheduler = await this.notificationQueue.getJobScheduler(
			notification.queueJobId,
		);

		const every = this.buildRepeatEvery(notification.frequency);
		notification.lastNotifiedAt = notification.toBeNotifiedAt;

		if (data.isPrimary) {
			notification.toBeNotifiedAt =
				scheduler && scheduler.next
					? new Date(scheduler.next)
					: addMilliseconds(notification.toBeNotifiedAt, every);
		} else {
			notification.toBeNotifiedAt = addMilliseconds(
				notification.toBeNotifiedAt,
				every,
			);
		}
		await notification.save();
	}

	/**
	 * Calculates the total repeat interval in milliseconds based on the custom Frequency structure.
	 * @param frequency The custom Frequency object defining the repeat count and type.
	 * @returns The total interval in milliseconds, or 0 if the input is invalid.
	 */
	private buildRepeatEvery(frequency: Frequency): number {
		const { repeatEvery, repetitionType } = frequency;
		if (repeatEvery < 1) {
			throw new Error('repeatEvery must be at least 1');
		}

		const ONE_SEC = 1000;
		const ONE_MIN = 60 * ONE_SEC;
		const ONE_HOUR = 60 * ONE_MIN;
		const ONE_DAY = 24 * ONE_HOUR;
		const ONE_WEEK = 7 * ONE_DAY;
		const TWELVE_HOURS = 12 * ONE_HOUR;
		const ONE_MONTH = 30 * ONE_DAY;
		const ONE_YEAR = 365 * ONE_DAY;

		switch (repetitionType) {
			case RepetitionType.HOURLY:
				return repeatEvery * ONE_HOUR;

			case RepetitionType.DAILY:
				if (repeatEvery === 1) {
					return ONE_DAY;
				}
				return TWELVE_HOURS / (repeatEvery - 1);

			case RepetitionType.WEEKLY:
				return ONE_WEEK / repeatEvery;

			case RepetitionType.MONTHLY:
				return ONE_MONTH / repeatEvery;

			case RepetitionType.YEARLY:
				return ONE_YEAR / repeatEvery;

			default:
				throw new Error(`Unsupported repetition type: ${repetitionType}`);
		}
	}
}

/**
 * A plain reminder for when the AI can't write one, e.g.
 * "Hi Ama, a reminder: Take Metformin; Take Lisinopril."
 */
export function fallbackReminderText(
	patientName: string | undefined,
	groupedNotifications: { goal?: string; targetName?: string }[],
): string {
	const firstName = patientName?.trim().split(/\s+/)[0];
	const items = [
		...new Set(
			groupedNotifications
				.map((not) => (not.goal || not.targetName || '').trim())
				.filter(Boolean),
		),
	];
	const greeting = firstName ? `Hi ${firstName}, ` : '';
	if (!items.length) {
		return `${greeting}${greeting ? 'you' : 'You'} have a health reminder from Yelima.`;
	}
	return `${greeting}${greeting ? 'a' : 'A'} reminder: ${items.join('; ')}.`;
}
