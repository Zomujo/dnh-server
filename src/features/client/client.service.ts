import { OpenAIWhisperAudio } from '@langchain/community/document_loaders/fs/openai_whisper_audio';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import {
	differenceInCalendarMonths,
	differenceInCalendarYears,
	differenceInDays,
	differenceInWeeks,
	eachDayOfInterval,
	endOfDay,
	endOfMonth,
	getDate,
	getDay,
	getHours,
	getMilliseconds,
	getMinutes,
	getMonth,
	getSeconds,
	isFuture,
	isToday,
	set,
	startOfDay,
	startOfMonth,
} from 'date-fns';
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
import { TargetType } from '@/features/adherences/dto/target-type.enum';
import { ChronicConditionsService } from '@/features/chronic-conditions/chronic-conditions.service';
import { ConcernsService } from '@/features/concerns/concerns.service';
import { MedicationSection } from '@/features/medications/dto';
import { MedicationsService } from '@/features/medications/medications.service';
import type { Frequency } from '@/features/notifications/dto/notification.dto';
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
						suggestions: [],
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

		const medications = await this.medicationsService.findByUserId(
			userId,
			pageFilter.offset,
			pageFilter.limit,
		);

		const count = await this.medicationsService.countByUserId(userId);

		return { medications: medications || [], count };
	}

	private shouldTakeToday(startDate: Date, frequency: Frequency): boolean {
		const now = new Date();
		const start = new Date(startDate);
		if (start > now) return false;

		const repType = frequency.repetitionType;
		const repeatEvery = frequency.repeatEvery || 1;

		switch (repType) {
			case 'daily':
			case 'hourly':
			case 'everyMinute':
			case 'everySecond': {
				return differenceInDays(now, start) % repeatEvery === 0;
			}
			case 'weekly': {
				return (
					differenceInWeeks(now, start) % repeatEvery === 0 &&
					getDay(now) === getDay(start)
				);
			}
			case 'monthly': {
				return (
					differenceInCalendarMonths(now, start) % repeatEvery === 0 &&
					getDate(now) === getDate(start)
				);
			}
			case 'yearly': {
				return (
					differenceInCalendarYears(now, start) % repeatEvery === 0 &&
					getMonth(now) === getMonth(start) &&
					getDate(now) === getDate(start)
				);
			}
			default:
				return false;
		}
	}

	private resolveToBeTakenAt(startDate: Date): Date {
		const now = new Date();
		const toBeTakenAt = set(now, {
			hours: getHours(startDate),
			minutes: getMinutes(startDate),
			seconds: getSeconds(startDate),
			milliseconds: getMilliseconds(startDate),
		});
		if (
			getHours(toBeTakenAt) === 0 &&
			getMinutes(toBeTakenAt) === 0 &&
			getSeconds(toBeTakenAt) === 0
		) {
			return set(toBeTakenAt, {
				hours: 8,
				minutes: 0,
				seconds: 0,
				milliseconds: 0,
			});
		}
		return toBeTakenAt;
	}

	private getSection(date: Date): MedicationSection {
		const hour = getHours(date);
		if (hour >= 5 && hour < 12) return MedicationSection.MORNING;
		if (hour >= 12 && hour < 17) return MedicationSection.AFTERNOON;
		return MedicationSection.EVENING;
	}

	async confirmMedication(medicationId: string, userId: string) {
		const medication = await this.medicationsService.findById(medicationId);

		const toBeTakenAt = this.resolveToBeTakenAt(medication.startDate);

		const todayStart = startOfDay(toBeTakenAt);
		const todayEnd = endOfDay(toBeTakenAt);

		const logId = await this.adherencesService.upsertAdherenceLog(
			{
				userId,
				targetType: TargetType.MEDICATION,
				targetName: medication.name,
				takenAt: { $gte: todayStart, $lte: todayEnd },
			},
			{
				userId,
				patient: medication.patient?.toString() ?? medication.patient,
				targetType: TargetType.MEDICATION,
				targetName: medication.name,
				taken: true,
				takenAt: toBeTakenAt,
				status: 'taken',
			} as any,
		);

		return { id: logId };
	}

	async countTodaysMedications(userId: string) {
		const medications = await this.medicationsService.findAllByUserId(userId);

		const counts = {
			[MedicationSection.MORNING]: 0,
			[MedicationSection.AFTERNOON]: 0,
			[MedicationSection.EVENING]: 0,
		};

		for (const med of medications) {
			if (!med.frequency || !med.startDate) continue;
			if (!this.shouldTakeToday(med.startDate, med.frequency)) continue;

			const toBeTakenAt = this.resolveToBeTakenAt(med.startDate);
			const section = this.getSection(toBeTakenAt);
			counts[section]++;
		}

		return counts;
	}

	async fetchTodaysMedications(section: MedicationSection, userId: string) {
		const medications = await this.medicationsService.findAllByUserId(userId);

		const result: {
			name: string;
			dosage: string;
			purpose: string;
			toBeTakenAt: Date;
			taken: boolean;
		}[] = [];

		for (const med of medications) {
			if (!med.frequency || !med.startDate) continue;

			if (!this.shouldTakeToday(med.startDate, med.frequency)) continue;

			const toBeTakenAt = this.resolveToBeTakenAt(med.startDate);
			if (this.getSection(toBeTakenAt) !== section) continue;

			result.push({
				name: med.name,
				dosage: med.dosage,
				purpose: med.purpose,
				toBeTakenAt,
				taken: false,
			});
		}

		if (result.length === 0) return result;

		const todayStart = startOfDay(new Date());
		const todayEnd = endOfDay(new Date());

		const medNames = result.map((m) => m.name);

		const logs = await this.adherencesService.findAllAdherenceLogsByQuery({
			query: {
				userId,
				targetType: TargetType.MEDICATION,
				targetName: { $in: medNames },
				takenAt: { $gte: todayStart, $lte: todayEnd },
			},
			projection: 'targetName taken',
			limit: 50,
		} as any);

		const takenMap = new Map<string, boolean>();
		for (const log of logs) {
			if (log.taken) {
				takenMap.set(log.targetName as string, true);
			}
		}

		for (const item of result) {
			if (takenMap.has(item.name)) {
				item.taken = true;
			}
		}

		return result;
	}

	async fetchMedicationAdherenceLogs(
		medicationId: string,
		userId: string,
		date: Date,
	) {
		const medication = await this.medicationsService.findById(medicationId);

		const logs = await this.adherencesService.findAdherenceLogsByTarget(
			userId,
			TargetType.MEDICATION,
			medication.name,
			31,
			date,
		);

		const monthStart = startOfMonth(date);
		const monthEnd = endOfMonth(date);
		const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

		const logMap = new Map<number, { taken: boolean; id: string }>();
		for (const log of logs) {
			logMap.set(getDate(log.takenAt), { taken: log.taken, id: log.id });
		}

		const normalizedLogs: {
			takenAt: Date;
			taken: boolean | null;
			id: string;
		}[] = [];

		for (const dayDate of allDays) {
			const day = getDate(dayDate);
			const entry = logMap.get(day);

			if (entry) {
				normalizedLogs.push({
					takenAt: dayDate,
					taken: entry.taken,
					id: entry.id,
				});
			} else {
				const isPending = isFuture(dayDate) || isToday(dayDate);
				normalizedLogs.push({
					takenAt: dayDate,
					taken: isPending ? null : false,
					id: new Types.ObjectId().toString(),
				});
			}
		}

		const takenCount = normalizedLogs.filter((l) => l.taken === true).length;
		const adherenceRate = Math.round((takenCount / allDays.length) * 100);

		return {
			medicationName: medication.name,
			adherenceRate,
			logs: normalizedLogs,
		};
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

	async fetchVitalHistoryLogs(userId: string, page: number, pageSize: number) {
		return this.vitalHistoryService.listVitalHistoryLogs(
			userId,
			page,
			pageSize,
		);
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
