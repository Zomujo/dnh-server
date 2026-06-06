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
import { DynamicStructuredTool } from '@langchain/core/tools';
import {
	ChatGoogleGenerativeAI,
	GoogleGenerativeAIChatCallOptions,
} from '@langchain/google-genai';
import {
	ConditionalEdgeRouter,
	END,
	GraphNode,
	START,
	StateGraph,
} from '@langchain/langgraph';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import { Injectable, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { MongoClient } from 'mongodb';
import { Connection, Model, Types } from 'mongoose';
import { getUserTimezone } from '@/features/client/ai/states';
import {
	CollectionDataSchema,
	PlannerQuerySchema,
	StreamCompletionInput,
} from './dto';
import {
	PlannerChat,
	PlannerMessageRole,
} from './entities/planner-chat.entity';
import { PlanAISchema } from './plans/dto';
import { PlansService } from './plans/plans.service';
import { PLANNER_AI_PROMPT } from './state/prompt.state';
import { PlannerStateSchema } from './state/schema.state';

@Injectable()
export class PlannerAiService {
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
	private toolsByName: Record<string, any>;

	constructor(
		@InjectModel(PlannerChat.name)
		private readonly plannerChatModel: Model<PlannerChat>,
		@InjectConnection() private connection: Connection,
		private readonly plansService: PlansService,
	) {
		const toolsByName = {
			[this.querySchema.name]: this.querySchema,
			[this.queryData.name]: this.queryData,
			[this.planScribe.name]: this.planScribe,
		};
		const tools = Object.values(toolsByName);
		const model = new ChatGoogleGenerativeAI({
			model: process.env.GOOGLE_AI_VERSION ?? 'gemini-2.5-flash',
			temperature: 0.7,
		});

		this.toolsByName = toolsByName;
		this.model = model.bindTools(tools);
		this.counter = model;
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
		const agent = new StateGraph(PlannerStateSchema)
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

	async streamCompletion(payload: StreamCompletionInput) {
		const messageId = new Types.ObjectId();

		const message = new HumanMessage({
			id: messageId.toString(),
			content: payload.message,
			additional_kwargs: {
				personnelId: payload.personnel.id,
				chatType: payload.chatType ?? 'text',
				timestamp: new Date().toISOString(),
			},
		});

		const response$ = await this.agent.stream(
			{
				messages: [message],
				patient: payload.patient,
				personnel: payload.personnel,
			},
			{
				configurable: { thread_id: payload.sessionId },
				streamMode: ['custom', 'messages'],
			},
		);

		return response$;
	}

	private randomThinking() {
		const thinkingWords = [
			'Pondering...',
			'Auscultating...',
			'Palpating...',
			'Suturing...',
			'Scrubbing...',
			'Rounds...',
			'Charting...',
			'Calibrating...',
			'Incising...',
			'Sterilizing...',
			'Dosing...',
			'Scanning...',
			'Imaging...',
			'Monitoring...',
			'Parsing...',
		];

		return thinkingWords[Math.floor(Math.random() * thinkingWords.length)];
	}

	private llmCall: GraphNode<typeof PlannerStateSchema> = async (
		state,
		config,
	) => {
		if (config.writer) config.writer({ status: this.randomThinking() });
		const systemMessage =
			SystemMessagePromptTemplate.fromTemplate(PLANNER_AI_PROMPT);

		const promptTemplate = ChatPromptTemplate.fromMessages([
			systemMessage,
			new MessagesPlaceholder('messages'),
		]);
		let threadId = '';
		if (config && config.configurable) {
			threadId = config.configurable.thread_id;
		}

		// const messages = await this.trimmer.invoke(state.messages);
		const messages = state.messages;
		const prompt = await promptTemplate.invoke({
			patientId: state.patient.id,
			userId: state.patient.userId,
			timezoneContext: getUserTimezone(),
			messages: messages,
			plannerSessionId: threadId,
			...state.personnel,
		});

		const response = await this.model.invoke(prompt);

		return {
			messages: [response],
			llmCalls: 1,
		};
	};

	private shouldContinue: ConditionalEdgeRouter<
		typeof PlannerStateSchema,
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

	private toolNode: GraphNode<typeof PlannerStateSchema> = async (
		state,
		config,
	) => {
		if (config.writer) config.writer({ status: 'Calling appropriate tool...' });
		const lastMessage = state.messages.at(-1);

		if (lastMessage == null || !AIMessage.isInstance(lastMessage)) {
			return { messages: [] };
		}

		const result: ToolMessage[] = [];
		for (const toolCall of lastMessage.tool_calls ?? []) {
			if (config.writer)
				config.writer({ status: `Peforming ${toolCall.name}...` });
			const tool = this.toolsByName[toolCall.name];
			const observation = await tool.invoke(toolCall);
			result.push(observation);
		}

		return { messages: result };
	};

	// Define tools
	private querySchema = new DynamicStructuredTool({
		name: 'querySchema',
		description: 'query mongo db schema by collection name',
		schema: CollectionDataSchema,
		func: async ({ name }) => this.listSchemas(name),
	});

	private queryData = new DynamicStructuredTool({
		name: 'queryData',
		description:
			'query data from mongoDB database using mongoDB schema information received from querySchema tool call. always call the querySchema tool first',
		schema: PlannerQuerySchema,
		func: async ({ userId, patient, name, aggregation }) =>
			this.queryByPatient(name, patient, userId, aggregation),
	});

	private planScribe = new DynamicStructuredTool({
		name: 'planScribe',
		description:
			'Tool for creating or updating a chronic care treatment plan. Accepts filters (identity) and data (upsert).',
		schema: PlanAISchema,
		func: async ({ filters, data }) =>
			this.plansService.upsertPlan(filters, data),
	});

	@OnEvent('planner.state.persist')
	async persistState(payload: {
		humanMessage: string;
		response: string;
		personnelId: string;
		sessionId: string;
		chatType: string;
		fromSource: string;
		receivedAt: Date;
	}) {
		const {
			humanMessage,
			response,
			personnelId,
			sessionId,
			chatType,
			fromSource,
			receivedAt,
		} = payload;

		const docs: object[] = [];

		docs.push({
			personnel: new Types.ObjectId(personnelId),
			plannerSession: new Types.ObjectId(sessionId),
			role: PlannerMessageRole.USER,
			content: humanMessage,
			type: chatType,
			createdAt: receivedAt,
			updatedAt: receivedAt,
		});

		docs.push({
			personnel: new Types.ObjectId(personnelId),
			plannerSession: new Types.ObjectId(sessionId),
			role: PlannerMessageRole.ASSISTANT,
			content: response,
			type: chatType,
			from: fromSource,
		});

		await this.plannerChatModel.insertMany(docs);
	}

	listModels() {
		const modelNames = this.connection.modelNames();
		return modelNames;
	}

	listSchemas(name: string) {
		const model = this.connection.model(name);

		const schemaPaths = Object.keys(model.schema.paths).reduce(
			(acc, path) => {
				const schemaType: any = model.schema.paths[path];
				const enumValues = schemaType.enumValues || schemaType.options?.enum;

				acc[path] = {
					type:
						schemaType.instance || schemaType.options?.type?.name || 'Unknown',
					description: schemaType.options?.description || undefined,
					...(enumValues && { enum: enumValues }),
				};
				return acc;
			},
			{} as Record<string, any>,
		);

		const data = {
			modelName: name,
			collectionName: model.collection.name,
			schemaPaths,
		};

		return JSON.stringify(data);
	}

	async queryByPatient(
		collectionName: string,
		patient: string,
		userId: string,
		additionalPipelines: any[] = [],
	) {
		const dynamicModel = this.connection.model(collectionName);

		if (!dynamicModel) {
			throw new NotFoundException(`Model for ${collectionName} not found.`);
		}

		const matchStage = {
			$match: {
				$or: [{ patient: patient }, { userId: userId }],
			},
		};

		// 3. Combine with the rest of your pipeline
		const pipeline = [matchStage, ...additionalPipelines];
		console.log('aggregation pipeline', pipeline);

		// 4. Execute the aggregation
		const data = await dynamicModel.aggregate(pipeline).exec();
		return JSON.stringify(data);
	}
}
