import { OpenAIWhisperAudio } from '@langchain/community/document_loaders/fs/openai_whisper_audio';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import * as fs from 'fs/promises';
import { toHeaderCase } from 'js-convert-case';
import { Collection, Connection, isValidObjectId, Types } from 'mongoose';
import * as os from 'os';
import * as path from 'path';
import { v7 as uuidv7 } from 'uuid';
import { generateFilter } from '@/common/factory';
import { generateCode } from '@/common/utils/helpers';
import { CacheService } from '@/core/caching/caching.service';
import { FirebaseService } from '@/core/firebase/firebase.service';
import { AdherencesService } from '@/features/adherences/adherences.service';
import { ChronicConditionsService } from '@/features/chronic-conditions/chronic-conditions.service';
import { ConcernsService } from '@/features/concerns/concerns.service';
import { MedicationsService } from '@/features/medications/medications.service';
import { NotificationsService } from '@/features/notifications/notifications.service';
import { PatientsService } from '@/features/patients/patients.service';
import { VitalHistoriesService } from '@/features/vital-histories/vital-histories.service';
import { DhVectorsService } from '../dh-vectors/dh-vectors.service';
import {
	BpTrendsQueryDto,
	LoadVitalHistoryDto,
	VitalHistoryTrendsQueryDto,
} from '../vital-histories/dto';
import { ClientAIService } from './ai/ai.service';
import { ExtClientAIService } from './ai/ai-ext.service';
import { ClientAIChatService } from './ai/client-ai-chat.service';
import { SupportedLanguages } from './ai/states';
import {
	ChatTypes,
	ChronicCareQueryDto,
	ChronicChatMessagesQueryDto,
	CreateChronicCareDto,
	UserPayload,
} from './dto';

@Injectable()
export class ClientService {
	private checkpointModel: Collection;
	private checkpointWritesModel: Collection;

	constructor(
		private readonly extClientAiService: ExtClientAIService,
		private readonly clientAiService: ClientAIService,
		private readonly userCacheService: CacheService<UserPayload>,
		private readonly patientsService: PatientsService,
		private readonly chronicConditionsService: ChronicConditionsService,
		private readonly medicationsService: MedicationsService,
		private readonly concernsService: ConcernsService,
		private readonly adherencesService: AdherencesService,
		private readonly firebaseService: FirebaseService,
		@InjectConnection() private connection: Connection,
		private readonly doctorNotificationsService: NotificationsService,
		private readonly clientAIChatService: ClientAIChatService,
		private readonly vitalHistoryService: VitalHistoriesService,
		private readonly dhVectorsService: DhVectorsService,
	) {
		this.checkpointModel = this.connection.collection('checkpoints');
		this.checkpointWritesModel =
			this.connection.collection('checkpoint_writes');
	}

	async chat(
		dto: CreateChronicCareDto,
		userId: string,
		language: SupportedLanguages,
		chatType: ChatTypes = 'text',
	) {
		const patientExists =
			await this.patientsService.countPatientsByUserId(userId);

		if (!dto.message && patientExists) {
			return { outResponse: null };
		}

		const patient = await this.retrievePatient(userId, language);

		const user = {
			patientId: patient._id.toString(),
			userId,
			name: patient.name,
			phoneNumber: patient.phoneNumber,
		};

		const response = await this.clientAiService.bulkCompletion({
			message: dto.message || 'H\u200Bello',
			userId,
			chatType,
			language,
			patient: user,
		});

		return response;
	}

	async testChatAudio(file: Express.Multer.File, question: string) {
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

			return { transcript: docs[0].pageContent };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new NotFoundException(message);
		} finally {
			try {
				await fs.unlink(tempFilePath);
			} catch (cleanupError) {
				console.warn('Failed to clean up temporary file:', cleanupError);
			}
		}
	}

	async chatAudio(
		file: Express.Multer.File,
		userId: string,
		language: SupportedLanguages,
		audioId: string,
	) {
		const audioIdPresent =
			await this.clientAIChatService.findByLocalChatId(audioId);
		if (audioIdPresent) {
			const response = await this.clientAIChatService.findNextAssistantMessage(
				userId,
				audioIdPresent.createdAt,
			);

			if (response) {
				return {
					outResponse: {
						_id: response.id,
						text: response.content,
						createdAt: response.createdAt,
					},
					inResponse: {
						_id: audioIdPresent.id,
						createdAt: audioIdPresent.createdAt,
					},
				};
			}

			await this.clientAIChatService.deleteById(audioIdPresent._id.toString());
		}

		const prevMessage =
			await this.clientAIChatService.findLastAssistantMessage(userId);

		const audioMongoId = new Types.ObjectId();
		const audioDocs = await this.extClientAiService.transcibeAudio(
			file,
			userId,
			audioId,
			audioMongoId,
			prevMessage?.content,
		);
		const transcript = audioDocs![0].pageContent;
		const chatResponse = await this.chat(
			{ message: transcript || '.' },
			userId,
			language,
			'audio',
		);

		if (chatResponse.outResponse) {
			chatResponse.inResponse._id = audioMongoId.toString();
		}

		return chatResponse;
	}

	async retrieveChatMessages(
		userId: string,
		query: ChronicChatMessagesQueryDto,
	) {
		const { pageFilter } = generateFilter(query);
		const messages = await this.clientAIChatService.findByUserId(
			userId,
			pageFilter.offset,
			pageFilter.limit,
		);

		const count = await this.clientAIChatService.countByUserId(userId);

		return { rows: messages, count };
	}

	async removeChatMessages(chatmessageId: string) {
		const whereOptions: Record<string, any> = {};

		if (isValidObjectId(chatmessageId)) {
			whereOptions._id = chatmessageId;
		} else {
			whereOptions.localChatId = chatmessageId;
		}

		await this.clientAIChatService.findOneAndDelete(whereOptions);

		return;
	}

	async retrievePatient(userId: string, language: SupportedLanguages) {
		const qdrantId = uuidv7();
		let patient = await this.patientsService.findPatientByUserId(
			userId,
			'_id createdAt updatedAt name phoneNumber language',
		);

		if (!patient) {
			let user = await this.userCacheService.get(userId);
			if (!user) {
				const fuser = await this.firebaseService.retrieveDoc('clients', userId);
				user = {
					name: fuser.doc.name,
					phoneNumber: `+${fuser.doc.phone_number.dial_code}${fuser.doc.phone_number.number}`,
				};
			}
			const patientCode = this.generatePatientCode(user.name);
			patient = await this.patientsService.createPatient({
				qdrantId,
				patientCode,
				userId,
				name: user.name,
				language: language.toString(),
				phoneNumber: user.phoneNumber,
			});
		}

		return patient;
	}

	private generatePatientCode(name: string) {
		return generateCode('ZC', name);
	}

	async fetchPatientData(userId: string) {
		const patient = await this.patientsService.findPatientByUserId(
			userId,
			'userId name yearOfBirth patientCode height gender',
		);
		if (!patient) {
			throw new NotFoundException('Patient not found');
		}
		return {
			id: patient._id,
			userId: patient.userId,
			name: patient.name,
			age: patient.age,
			gender: patient.gender,
			patientCode: patient.patientCode || null,
		};
	}

	async fetchChronicConditions(query: ChronicCareQueryDto, userId: string) {
		const { pageFilter } = generateFilter(query);
		const chronicConditions = await this.chronicConditionsService.findByUserId(
			userId,
			pageFilter.offset,
			pageFilter.limit,
		);

		const count = await this.chronicConditionsService.countByUserId(userId);

		return { chronicConditions, count };
	}

	async fetchMedications(query: ChronicCareQueryDto, userId: string) {
		const { pageFilter } = generateFilter(query);

		const medications =
			await this.medicationsService.findMedicationsWithAdherence(
				userId,
				pageFilter.offset,
				pageFilter.limit,
			);

		const count = await this.medicationsService.countByUserId(userId);

		return { medications: medications || [], count };
	}

	async logVitalHistory(dto: LoadVitalHistoryDto, userId: string) {
		const patient = await this.patientsService.findPatientByUserId(
			userId,
			'_id',
		);

		if (!patient) {
			throw new NotFoundException('Patient not found');
		}

		return this.vitalHistoryService.loadVitalHistory(
			{ ...dto, patient: patient._id.toString() },
			userId,
		);
	}

	async fetchVitalHistory(userId: string) {
		const response = await this.vitalHistoryService.fetchVitalHistory(userId);
		return response;
	}

	async fetchVitalTrend(userId: string, query: VitalHistoryTrendsQueryDto) {
		const response = await this.vitalHistoryService.fetchVitalTrend(
			userId,
			query,
		);
		return response;
	}

	async fetchBPTrend(userId: string, query: BpTrendsQueryDto) {
		const response = await this.vitalHistoryService.fetchBPTrend(userId, query);
		return response;
	}

	async fetchAdherencePatterns(query: ChronicCareQueryDto, userId: string) {
		const { pageFilter } = generateFilter(query);
		const subsLimit = 4;

		const result = await this.adherencesService.aggregateAdherencePatterns(
			userId,
			pageFilter.offset,
			pageFilter.limit,
			subsLimit,
		);

		const total =
			await this.adherencesService.countAdherencePatternGroups(userId);

		result.forEach((res) => {
			res.items.forEach((item: any) => {
				item.targetName = toHeaderCase(item.targetName);
			});
		});

		return { rows: result, count: total };
	}

	async fetchMedicationAdherence(userId: string, showWeekdays?: boolean) {
		const rate =
			await this.adherencesService.aggregateMedicationAdherence(userId);

		if (!showWeekdays) {
			return { rate };
		}

		const days =
			await this.adherencesService.aggregateMedicationTakenByWeek(userId);
		return { rate, days };
	}

	async fetchConcerns(query: ChronicCareQueryDto, userId: string) {
		const { pageFilter } = generateFilter(query);
		const concerns = await this.concernsService.findByUserId(
			userId,
			pageFilter.offset,
			pageFilter.limit,
		);

		const count = await this.concernsService.countByUserId(userId);

		return { concerns, count };
	}

	async purgePatient(userId: string, patientId: string) {
		await this.checkpointModel.deleteMany({
			thread_id: userId,
		});
		await this.checkpointWritesModel.deleteMany({
			thread_id: userId,
		});
		await this.patientsService.removePatientsByUserId(userId);
		await this.chronicConditionsService.removeByUserId(userId);
		await this.medicationsService.removeByUserId(userId);
		await this.vitalHistoryService.removeByUserId(userId);
		await this.adherencesService.removeLogsByUserId(userId);
		await this.adherencesService.removePatternsByUserId(userId);
		await this.concernsService.removeByUserId(userId);
		await this.clientAIChatService.removeByUserId(userId);
		await this.patientsService.removeSummariesByUserId(userId);
		await this.firebaseService.deleteFolder(
			'chronic_care_chat_audios/' + userId,
		);

		if (patientId) {
			await this.doctorNotificationsService.purgeNotifications(patientId);
		}
		await this.dhVectorsService.cleanOrphans(userId);
	}
}
