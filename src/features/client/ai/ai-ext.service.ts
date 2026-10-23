import { randomUUID } from 'node:crypto';
import { OpenAIWhisperAudio } from '@langchain/community/document_loaders/fs/openai_whisper_audio';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { END, START, StateGraph } from '@langchain/langgraph';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import * as fs from 'fs/promises';
import { Connection, Model, Types } from 'mongoose';
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

	// Reuses Mongoose's already-connected, already-lifecycle-managed MongoClient
	// (see 7.1/7.2 fix notes) instead of opening a dedicated connection pool.
	private checkpointer: MongoDBSaver;

	constructor(
		@InjectModel(ClientAIChat.name)
		private clientAIChatModel: Model<ClientAIChat>,
		@InjectConnection()
		private connection: Connection,
		private eventEmitter: EventEmitter2,
		private firebaseService: FirebaseService,
	) {
		this.checkpointer = new MongoDBSaver({
			client: this.connection.getClient() as any,
			dbName: process.env.DB_NAME,
		});
	}

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
		// Server-generated temp name: the client's filename is neither unique
		// (two users uploading "audio.m4a" at once would read — and unlink —
		// each other's file) nor safe to join into a path.
		const extension = path.extname(path.basename(file.originalname ?? ''));
		const tempFilePath = path.join(
			os.tmpdir(),
			`chat-audio-${randomUUID()}${/^\.[a-zA-Z0-9]{1,8}$/.test(extension) ? extension : '.m4a'}`,
		);
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
			const objectPath = this.firebaseService.newObjectPath(
				`chronic_care_chat_audios/${userId}`,
				file.originalname,
			);

			this.eventEmitter.emit('audio.firebase.push', { file, objectPath });

			this.eventEmitter.emit('audio.state.persist', {
				objectPath,
				userId,
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
		objectPath: string;
	}) {
		try {
			await this.firebaseService.uploadFile(payload.file, payload.objectPath);
		} catch (error) {
			this.logger.error(
				`Voice note upload failed for ${payload.objectPath}`,
				error,
			);
		}
	}

	@OnEvent('audio.state.persist')
	async persistAudioMessage(payload: {
		objectPath: string;
		userId: string;
		audioId: string;
		audioMongoId: Types.ObjectId;
	}) {
		const timestamp = new Date();

		// Stored without an access token; history reads hand out short-lived
		// signed URLs for it (ClientService.retrieveChatMessages).
		await this.clientAIChatModel.create({
			_id: payload.audioMongoId,
			userId: payload.userId,
			role: AIMessageRole.USER,
			content: this.firebaseService.objectUrl(payload.objectPath),
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
