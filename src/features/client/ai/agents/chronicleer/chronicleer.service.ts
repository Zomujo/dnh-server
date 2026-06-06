import { PromptTemplate } from '@langchain/core/prompts';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { Injectable } from '@nestjs/common';
import { ClientAIState } from '@/features/client/ai/states';
import { AiInsights, SummarySchema } from './state';

@Injectable()
export class ChronicleerService {
	private get llm() {
		return new ChatGoogleGenerativeAI({
			model: process.env.GOOGLE_AI_VERSION ?? 'gemini-2.5-flash',
			temperature: 0.7,
		});
	}

	async summarize(state: typeof ClientAIState.State) {
		const structuredModel =
			this.llm.withStructuredOutput<AiInsights>(SummarySchema);

		const promptTemplate = PromptTemplate.fromTemplate(
			'You are the Summary Generator for Zyptyk AI. Given the full conversation history, generate the summary. Conversation History: {conversationHistory}',
		);

		const prompt = await promptTemplate.invoke({
			conversationHistory: state.messages,
		});

		const structuredOutput = await structuredModel.invoke(prompt);
		return { summary: structuredOutput };
	}
}
