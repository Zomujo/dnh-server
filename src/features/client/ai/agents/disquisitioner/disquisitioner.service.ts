import { AIMessage } from '@langchain/core/messages';
import {
	ChatPromptTemplate,
	MessagesPlaceholder,
} from '@langchain/core/prompts';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { Types } from 'mongoose';
import { ClientAIState, getUserTimezone } from '@/features/client/ai/states';
import {
	ConversationPrompts,
	ConversationScope,
	ConversationScopes,
	InterviewTurn,
	InterviewTurnSchema,
	POST_ONBOARDING_PROMPT,
} from './state';

// @Injectable()
export class DisquisitionerService {
	private model: ChatGoogleGenerativeAI;

	constructor(model: ChatGoogleGenerativeAI) {
		this.model = model;
	}
	// private get model() {
	// 	return new ChatGoogleGenerativeAI({
	// 		model: process.env.GOOGLE_AI_VERSION ?? 'gemini-2.5-flash',
	// 		temperature: 0.7,
	// 	});
	// }

	private async summon(
		conversationScope: ConversationScope,
		state: typeof ClientAIState.State,
	) {
		// Build system prompt
		let conversationPrompt = ConversationPrompts[conversationScope].prompt;
		if (conversationScope == ConversationScope.END) {
			conversationPrompt = POST_ONBOARDING_PROMPT;
		}
		const promptTemplate = ChatPromptTemplate.fromMessages([
			['system', conversationPrompt],
			new MessagesPlaceholder('messages'),
			new MessagesPlaceholder('toolMessages'),
		]);

		let questions = [...state.questions];

		const prompt = await promptTemplate.invoke({
			questions: questions.join(', '),
			secondaryTopic:
				ConversationPrompts[state.nextConversationScope!].questions[0],
			name: state.user?.name,
			language: state.user?.language,
			messages: state.messages,
			toolMessages: state.toolMessages,
			timezone: getUserTimezone(),
		});

		const structuredModel =
			this.model.withStructuredOutput<InterviewTurn>(InterviewTurnSchema);

		const { aiResponse, allQuestionsAsked } =
			await structuredModel.invoke(prompt);

		if (allQuestionsAsked) {
			state.previousQuestion = questions;
			questions = [];
		}

		const humanMessage = state.messages.at(-1)!;
		const messageId = new Types.ObjectId();
		const aiMessage = new AIMessage({
			id: messageId.toString(),
			content: aiResponse,
			additional_kwargs: {
				timestamp: new Date().toISOString(),
				userId: humanMessage.additional_kwargs.userId,
				chatType: humanMessage.additional_kwargs.chatType,
			},
		});

		return {
			questions,
			previousQuestion: state.previousQuestion,
			conversationScope,
			nextConversationScope: state.nextConversationScope,
			messages: [aiMessage],
			allQuestionsAsked: allQuestionsAsked,
		};
	}

	async converse(state: typeof ClientAIState.State) {
		state = this.switchConversationScope(state);
		state.allQuestionsAsked = false;

		switch (state.conversationScope) {
			case ConversationScope.GENERAL:
				return await this.summon(ConversationScope.GENERAL, state);
			case ConversationScope.CHRONIC_CONDITIONS:
				return await this.summon(ConversationScope.CHRONIC_CONDITIONS, state);
			case ConversationScope.MEDICATIONS:
				return await this.summon(ConversationScope.MEDICATIONS, state);
			case ConversationScope.VITAL_HISTORY:
				return await this.summon(ConversationScope.VITAL_HISTORY, state);
			case ConversationScope.CONCERNS:
				return await this.summon(ConversationScope.CONCERNS, state);
			default:
				return await this.summon(ConversationScope.END, state);
		}
	}

	private switchConversationScope(state: typeof ClientAIState.State) {
		const questionsRemaining = state.questions.length;

		if (questionsRemaining === 0) {
			state.conversationScope = state.nextConversationScope;

			const nextIndex =
				ConversationScopes.indexOf(state.conversationScope!) + 1;

			state.nextConversationScope =
				nextIndex < ConversationScopes.length
					? ConversationScopes[nextIndex]
					: ConversationScopes.at(-1)!;

			state.questions = ConversationPrompts[state.conversationScope!].questions;

			if (process.env.NODE_ENV === 'development') {
				console.warn('[New Questions ]', state.questions);
			}
		}
		return state;
	}
}
