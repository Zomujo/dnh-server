import { BaseLanguageModelInput } from '@langchain/core/language_models/base';
import {
	AIMessage,
	AIMessageChunk,
	HumanMessage,
	ToolMessage,
	trimMessages,
} from '@langchain/core/messages';
import {
	ChatPromptTemplate,
	MessagesPlaceholder,
	SystemMessagePromptTemplate,
} from '@langchain/core/prompts';
import { Runnable } from '@langchain/core/runnables';
import { ToolRuntime, tool } from '@langchain/core/tools';
import {
	ChatGoogleGenerativeAI,
	GoogleGenerativeAIChatCallOptions,
} from '@langchain/google-genai';
import {
	Command,
	ConditionalEdgeRouter,
	END,
	GraphNode,
	START,
	StateGraph,
} from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import { MongoClient } from 'mongodb';
import { Model, Types } from 'mongoose';
import { z } from 'zod';
import {
	ConversationPrompts,
	ConversationScope,
	ConversationScopes,
	POST_ONBOARDING_PROMPT,
} from './agents/disquisitioner/state';
import { MemoryScribeService } from './agents/memory-scribe/memory-scribe.service';
import { AIMessageRole, ClientAIChat } from './entities/ai-chat.entity';
import {
	ClientAICompletionInput,
	ClientAIState,
	getUserTimezone,
} from './states';

@Injectable()
export class ClientAIService {
	private checkpointer = new MongoDBSaver({
		client: new MongoClient(process.env.DB_CONNECTION_STRING!) as any,
		dbName: process.env.DB_NAME,
	});
	// private memory = new MemorySaver();
	private model: Runnable<
		BaseLanguageModelInput,
		AIMessageChunk,
		GoogleGenerativeAIChatCallOptions
	>;
	private counter: ChatGoogleGenerativeAI;
	private toolNode: ToolNode;

	constructor(
		@InjectModel(ClientAIChat.name)
		private readonly clientAIChatModel: Model<ClientAIChat>,
		private readonly memoryScribeService: MemoryScribeService,
		private readonly eventEmitter: EventEmitter2,
	) {
		const toolsByName = this.memoryScribeService.memoryTools;
		toolsByName[this.changeConversationScope.name] =
			this.changeConversationScope;
		const tools = Object.values(toolsByName);
		const model = new ChatGoogleGenerativeAI({
			model: process.env.GOOGLE_AI_VERSION ?? 'gemini-2.5-flash',
			temperature: 0.7,
		});

		this.model = model.bindTools(tools);
		this.counter = model;
		this.toolNode = new ToolNode(tools);
	}

	private get trimmer() {
		return trimMessages({
			maxTokens: 80000,
			strategy: 'last',
			tokenCounter: this.counter,
			includeSystem: true,
			allowPartial: false,
			startOn: 'human',
		});
	}

	private get agent() {
		const agent = new StateGraph(ClientAIState)
			.addNode('llmCall', this.llmCall)
			.addNode('toolNode', this.toolNode)
			.addEdge(START, 'llmCall')
			.addConditionalEdges('llmCall', this.shouldContinue, ['toolNode', END])
			.addEdge('toolNode', 'llmCall')
			.compile({
				checkpointer: this.checkpointer,
			});

		return agent;
	}

	async bulkCompletion(payload: ClientAICompletionInput) {
		const messageId = new Types.ObjectId();
		const now = new Date();

		const message = new HumanMessage({
			id: messageId.toString(),
			content: payload.message,
			additional_kwargs: {
				userId: payload.patient.userId,
				chatType: payload.chatType ?? 'text',
				timestamp: now.toISOString(),
			},
		});

		const output = await this.agent.invoke(
			{
				messages: [message],
				user: { ...payload.patient, language: payload.language },
			},
			{
				configurable: { thread_id: payload.patient.userId },
			},
		);
		const response = output.messages.at(-1)!;

		this.eventEmitter.emit('client-ai.state.persist', {
			humanMessage: message,
			response: response,
			userId: payload.patient.userId,
			chatType: payload.chatType ?? 'text',
			receivedAt: now,
		});

		let inResponse: any = null;
		if (message.content !== 'H\u200Bello') {
			inResponse = {
				_id: message.id,
				createdAt: message.additional_kwargs.timestamp,
			};
		}

		const text = response.content as string;
		let suggestions: string[] = [];

		const suggestionsPrefix = '[SUGGESTIONS]: ';
		const lastIndex = text.lastIndexOf(suggestionsPrefix);
		if (lastIndex !== -1) {
			const afterMarker = text.slice(lastIndex + suggestionsPrefix.length);
			suggestions = afterMarker
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);
			response.content = text.slice(0, lastIndex).trim();
		}

		return {
			outResponse: {
				_id: response.id,
				text: response.content,
				createdAt: response.additional_kwargs.timestamp,
				suggestions,
			},
			inResponse: inResponse,
		};
	}

	private llmCall: GraphNode<typeof ClientAIState> = async (state) => {
		let conversationPrompt =
			ConversationPrompts[state.conversationScope!].prompt;
		if (state.conversationScope == ConversationScope.END) {
			conversationPrompt = POST_ONBOARDING_PROMPT;
		}

		const systemMessage =
			SystemMessagePromptTemplate.fromTemplate(conversationPrompt);

		const promptTemplate = ChatPromptTemplate.fromMessages([
			systemMessage,
			new MessagesPlaceholder('messages'),
		]);

		let questions = ConversationPrompts[state.conversationScope!].questions;

		state.messages = await this.trimmer.invoke(state.messages);
		const prompt = await promptTemplate.invoke({
			questions: questions.join(', '),
			secondaryTopic:
				ConversationPrompts[state.nextConversationScope!].questions[0],
			...state.user,
			messages: state.messages,
			currentConversationScope: state.conversationScope,
			nextConversationScope: state.nextConversationScope,
			timezone: getUserTimezone(),
		});

		// console.log(prompt.toString());
		const response = await this.model.invoke(prompt);
		response.id = new Types.ObjectId().toString();
		response.additional_kwargs = {
			timestamp: new Date().toISOString(),
		};

		return {
			messages: [response],
		};
	};

	private shouldContinue: ConditionalEdgeRouter<
		typeof ClientAIState,
		{},
		'toolNode'
	> = (state) => {
		const lastMessage = state.messages.at(-1);

		if (!lastMessage || !AIMessage.isInstance(lastMessage)) {
			return END;
		}

		if (lastMessage.tool_calls?.length) {
			return 'toolNode';
		}
		return END;
	};

	//tools
	private changeConversationScope = tool(
		async ({ conversationScope }, config: ToolRuntime) => {
			const result = `Conversation scope changed to ${conversationScope}`;
			console.log('scope change', result);
			const nextIndex =
				ConversationScopes.indexOf(conversationScope as ConversationScope) + 1;

			const nextConversationScope =
				nextIndex < ConversationScopes.length
					? ConversationScopes[nextIndex]
					: ConversationScopes.at(-1)!;

			return new Command({
				update: {
					conversationScope,
					nextConversationScope,
					messages: [
						new ToolMessage({
							content: result,
							tool_call_id: config.toolCallId,
							name: 'changeConversationScope',
						}),
					],
				},
			});
		},
		{
			name: 'changeConversationScope',
			description:
				'Tool for changing conversation scope to nextConversationScope state after all questions for that scope has been asked and answered appropriately.',
			schema: z.object({
				conversationScope: z.enum([
					'general',
					'chronicConditions',
					'medications',
					'vitalHistory',
					'concerns',
					'end',
				]),
			}),
		},
	);

	@OnEvent('client-ai.state.persist')
	async persistState(payload: {
		humanMessage?: HumanMessage;
		response: AIMessage;
		userId: string;
		chatType: string;
		receivedAt: Date;
	}) {
		const { humanMessage, response, userId, chatType, receivedAt } = payload;

		const docs: object[] = [];
		if (
			humanMessage &&
			humanMessage.content !== 'H\u200Bello' &&
			chatType === 'text'
		) {
			docs.push({
				_id: humanMessage.id,
				userId: userId,
				role: AIMessageRole.USER,
				content: humanMessage.content,
				type: chatType,
				createdAt: receivedAt,
				updatedAt: receivedAt,
			});
		}

		const aiTimestamp = response.additional_kwargs.timestamp as Date;
		docs.push({
			_id: response.id,
			userId: userId,
			role: AIMessageRole.ASSISTANT,
			content: response.content,
			type: 'text',
			from: chatType,
			createdAt: aiTimestamp,
			updatedAt: aiTimestamp,
		});

		await this.clientAIChatModel.insertMany(docs);
	}
}
