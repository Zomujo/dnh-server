import {
	ChatPromptTemplate,
	MessagesPlaceholder,
} from '@langchain/core/prompts';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { ClientAIState, getUserTimezone } from '@/features/client/ai/states';
import {
	NotificationUpsertRequestDto,
	NotificationUpsertRequestSchema,
} from '@/features/notifications/dto';
import { NotificationsService } from '@/features/notifications/notifications.service';
import { AUGUR_PROMPT } from './state';

@Injectable()
export class AuguryService {
	constructor(private readonly notificationsService: NotificationsService) {}

	private get model() {
		return new ChatGoogleGenerativeAI({
			model: process.env.GOOGLE_AI_VERSION ?? 'gemini-2.5-flash',
			temperature: 0.7,
		});
	}

	async notify(state: typeof ClientAIState.State) {
		const promptTemplate = ChatPromptTemplate.fromMessages([
			['system', AUGUR_PROMPT],
			new MessagesPlaceholder('messages'),
		]);

		//
		// const promptTemplate = ChatPromptTemplate.fromMessages([
		// 	[
		// 		'system',
		// 		'You are a helpful assistant that notifies doctors about important patient updates. Summarize the key points from the patient messages and state.',
		// 	],
		// 	new MessagesPlaceholder('humanMessages'),
		// ]);

		const prompt = await promptTemplate.invoke({
			userId: state.user?.userId,
			patientId: state.user?.patientId,
			name: state.user?.name,
			phoneNumber: state.user?.phoneNumber,
			language: state.user?.language,
			timezoneContext: getUserTimezone(),
			messages: state.messages,
		});

		const tools = [this.augury() as any];

		const augurR = this.model.bindTools(tools);
		const response = await augurR.invoke(prompt);
		if (process.env.NODE_ENV === 'development') {
			console.log('Augury response:', JSON.stringify(response));
		}
		return;
	}

	private augury() {
		return new DynamicStructuredTool<
			typeof NotificationUpsertRequestSchema,
			NotificationUpsertRequestDto,
			NotificationUpsertRequestDto,
			Types.ObjectId | string
		>({
			name: 'notificationsScribe',
			description:
				'Tool for creating or updating a notification. Accepts filters (past values) and data (present values).',
			schema: NotificationUpsertRequestSchema,
			func: async (params: NotificationUpsertRequestDto) => {
				const response = await this.notificationsService.upsertNotification(
					params.filters,
					params.data,
				);
				return response;
			},
		});
	}
}
