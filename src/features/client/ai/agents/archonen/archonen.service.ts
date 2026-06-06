import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { PromptTemplate } from '@langchain/core/prompts';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { Injectable } from '@nestjs/common';
import { ClientAIState } from '../../states';
import {
	ARCHONEN_PROMPT,
	ArchonenDecision,
	ArchonenDecisionSchema,
} from './state';

@Injectable()
export class ArchonenService {
	private readonly llm: ChatGoogleGenerativeAI;

	constructor() {
		this.llm = new ChatGoogleGenerativeAI({
			model: process.env.GOOGLE_AI_VERSION ?? 'gemini-2.5-flash',
			temperature: 0.7,
		});
	}

	async archoneR(state: typeof ClientAIState.State) {
		const promptTemplate = PromptTemplate.fromTemplate(ARCHONEN_PROMPT);

		const message =
			(state.messages.at(-1) as HumanMessage) ?? new HumanMessage('hello');

		// console.log('the message: ', message);

		const prompt = await promptTemplate.invoke({
			conversationHistory: state.messages || [message],
			previousQuestion: (state.messages.at(-2) as AIMessage) ?? '',
			patientMessage: message,
		});

		const structuredModel = this.llm.withStructuredOutput<ArchonenDecision>(
			ArchonenDecisionSchema,
		);

		const response = await structuredModel.invoke(prompt);

		return {
			archonenRoutes: response,
		};
	}
}
