import { OpenAIWhisperAudio } from '@langchain/community/document_loaders/fs/openai_whisper_audio';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { END, START, StateGraph } from '@langchain/langgraph';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { InjectModel } from '@nestjs/mongoose';
import * as fs from 'fs/promises';
import { MongoClient } from 'mongodb';
import { Model, Types } from 'mongoose';
import * as os from 'os';
import * as path from 'path';
import { FirebaseService } from '@/core/firebase/firebase.service';
import { PatientPayload } from '../../patients/dto';
import { IConfig } from '../dto';
import { AIMessageRole, ClientAIChat } from './entities/ai-chat.entity';
import { ClientAIState } from './states';

@Injectable()
export class ExtClientAIService {
	private logger = new Logger(ExtClientAIService.name);

	private checkpointer = new MongoDBSaver({
		client: new MongoClient(process.env.DB_CONNECTION_STRING!) as any,
		dbName: process.env.DB_NAME,
	});

	constructor(
		@InjectModel(ClientAIChat.name)
		private clientAIChatModel: Model<ClientAIChat>,
		private eventEmitter: EventEmitter2,
		private firebaseService: FirebaseService,
	) {}

	private statePersister = async (state: typeof ClientAIState.State) => {
		this.eventEmitter.emit('state.persist', {
			response: state.messages.at(-1)!,
		});
		return {
			messages: [state.messages.at(-1)!],
		};
	};

	get statePersistorApp() {
		const builder = new StateGraph(ClientAIState)
			.addNode('PersistState', this.statePersister)
			.addEdge(START, 'PersistState')
			.addEdge('PersistState', END);

		return builder.compile({ checkpointer: this.checkpointer });
	}

	async transcibeAudio(
		file: Express.Multer.File,
		userId: string,
		audioId: string,
		audioMongoId: Types.ObjectId,
		question?: string,
	) {
		const tempDir = os.tmpdir();
		const tempFilePath = path.join(tempDir, `${file.originalname}`);
		const medicalPrompt =
			`Transcribe in context to the question. if the response doesn't correlate to the question, transcribe anyway. Question: ${question}
       Glossary: Gender -> male,female,etc. 
			`.trim();

		try {
			await fs.writeFile(tempFilePath, file.buffer);

			const loader = new OpenAIWhisperAudio(tempFilePath, {
				transcriptionCreateParams: {
					prompt: medicalPrompt,
				},
			});

			const docs = await loader.load();
			const uuidToken = crypto.randomUUID();

			this.eventEmitter.emit('audio.firebase.push', {
				file,
				uuidToken,
				userId,
			});

			this.eventEmitter.emit('audio.state.persist', {
				fileName: file.originalname,
				userId,
				uuidToken,
				audioId,
				audioMongoId,
			});

			return docs;
		} catch (error) {
			this.logger.error('Error processing audio:', error);
		} finally {
			try {
				await fs.unlink(tempFilePath);
			} catch (cleanupError) {
				this.logger.warn('Failed to clean up temporary file:', cleanupError);
			}
		}
	}

	@OnEvent('audio.firebase.push')
	async pushToFirebase(payload: {
		file: Express.Multer.File;
		uuidToken: string;
		userId: string;
	}) {
		const response = await this.firebaseService.uploadFile(
			payload.file,
			'chronic_care_chat_audios/' + payload.userId,
			payload.uuidToken,
		);
		return response;
	}

	@OnEvent('audio.state.persist')
	async persistAudioMessage(payload: {
		fileName: string;
		userId: string;
		uuidToken: string;
		audioId: string;
		audioMongoId: Types.ObjectId;
	}) {
		const timestamp = new Date();
		const fileName = `chronic_care_chat_audios/${payload.userId}/${payload.fileName}`;

		await this.clientAIChatModel.create({
			_id: payload.audioMongoId,
			userId: payload.userId,
			role: AIMessageRole.USER,
			content: `https://firebasestorage.googleapis.com/v0/b/zyptyk-base.appspot.com/o/${encodeURIComponent(fileName)}?alt=media&token=${payload.uuidToken}`,
			type: 'audio',
			localChatId: payload.audioId,
			createdAt: timestamp,
			updatedAt: timestamp,
		});
	}

	async persistData(
		message: HumanMessage | AIMessage,
		config: IConfig,
		language: string,
		bioData: PatientPayload,
	) {
		const persistedState = await this.statePersistorApp.invoke(
			{
				user: { ...bioData, language },
				messages: [message],
			},
			config,
		);

		return persistedState;
	}
}
