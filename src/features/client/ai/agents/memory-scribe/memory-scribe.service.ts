// import * as fs from 'node:fs';
import {
	ChatPromptTemplate,
	MessagesPlaceholder,
} from '@langchain/core/prompts';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Types } from 'mongoose';
import { AdherencesService } from '@/features/adherences/adherences.service';
import {
	AdherenceLogAISchema,
	AdherenceLogIdentity,
	AdherenceLogUpsertInput,
	AdherencePatternAISchema,
	AdherencePatternIdentity,
	AdherencePatternUpsertInput,
} from '@/features/adherences/dto';
import { ChronicConditionsService } from '@/features/chronic-conditions/chronic-conditions.service';
import {
	ChronicConditionAISchema,
	ChronicConditionIdentity,
	ChronicConditionUpsertInput,
} from '@/features/chronic-conditions/dto';
import { ConcernsService } from '@/features/concerns/concerns.service';
import {
	ConcernAISchema,
	ConcernIdentity,
	ConcernUpsertInput,
} from '@/features/concerns/dto';
import {
	MedicationAISchema,
	MedicationIdentity,
	MedicationUpsertInput,
} from '@/features/medications/dto';
import { MedicationsService } from '@/features/medications/medications.service';
import {
	NotificationFilterDto,
	NotificationUpsertRequestSchema,
	UpsertNotificationDto,
} from '@/features/notifications/dto';
import { NotificationsService } from '@/features/notifications/notifications.service';
import {
	PatientAISchema,
	PatientIdentity,
	PatientUpsertInput,
} from '@/features/patients/dto';
import { PatientsService } from '@/features/patients/patients.service';
import {
	VitalHistoryAISchema,
	VitalHistoryIdentity,
	VitalHistoryUpsertInput,
} from '@/features/vital-histories/dto';
import { VitalHistoriesService } from '@/features/vital-histories/vital-histories.service';
import { ClientAIState, getUserTimezone } from '../../states';
import { MEMORY_SCRIBE_PROMPT } from './state';

@Injectable()
export class MemoryScribeService {
	private logger = new Logger(MemoryScribeService.name);
	private model: ChatGoogleGenerativeAI;

	constructor(
		private readonly adherencesService: AdherencesService,
		private readonly chronicConditionsService: ChronicConditionsService,
		private readonly concernsService: ConcernsService,
		private readonly medicationsService: MedicationsService,
		private readonly patientsService: PatientsService,
		private readonly vitalHistoriesService: VitalHistoriesService,
		private readonly notificationsService: NotificationsService,
		private readonly eventEmitter: EventEmitter2,
	) {
		this.model = new ChatGoogleGenerativeAI({
			model: process.env.GOOGLE_AI_VERSION ?? 'gemini-2.5-flash',
			temperature: 0.5,
		});
	}

	// private get model() {
	// 	return new ChatGoogleGenerativeAI({
	// 		model: process.env.GOOGLE_AI_VERSION ?? 'gemini-2.5-flash',
	// 		temperature: 0.1,
	// 	});
	// }

	async memorize(state: typeof ClientAIState.State) {
		const promptTemplate = ChatPromptTemplate.fromMessages([
			['system', MEMORY_SCRIBE_PROMPT],
			new MessagesPlaceholder('messages'),
		]);
		const prompt = await promptTemplate.invoke({
			userId: state.user?.userId,
			patientId: state.user?.patientId,
			name: state.user?.name,
			phoneNumber: state.user?.phoneNumber,
			language: state.user?.language,
			timezoneContext: getUserTimezone(),
			messages: state.messages,
		});

		const tools = [
			this.adherenceLog,
			this.adherencePattern,
			this.augury,
			this.chronicCondition,
			this.concern,
			this.medication,
			this.patient,
			this.vitalHistory,
		];
		const toolNode = new ToolNode(tools);

		const memoryScriber = this.model.bindTools(tools);
		const response = await memoryScriber.invoke(prompt);

		if (process.env.NODE_ENV === 'development') {
			console.log('Memory Scribe response:', JSON.stringify(response));
		}

		const memoryScribeResponse = await toolNode.invoke({
			messages: [response],
		});
		console.log(
			'Memory scribe tool call result:',
			memoryScribeResponse.messages,
		);

		return {};
	}

	get memoryTools() {
		return {
			[this.adherenceLog.name]: this.adherenceLog,
			[this.augury.name]: this.augury,
			[this.chronicCondition.name]: this.chronicCondition,
			[this.concern.name]: this.concern,
			[this.medication.name]: this.medication,
			[this.patient.name]: this.patient,
			[this.vitalHistory.name]: this.vitalHistory,
		};
	}

	private adherenceLog = new DynamicStructuredTool({
		name: 'adherenceLogsScribe',
		description:
			'Tool for creating or updating an adherence log. Accepts filters (past values) and data (present values).',
		schema: AdherenceLogAISchema,
		func: async (params) => {
			const id = new Types.ObjectId();
			this.eventEmitter.emit('adherenceLog.persist', params);
			return id.toString();
		},
	});

	private adherencePattern = new DynamicStructuredTool({
		name: 'adherencePatternsScribe',
		description:
			'Tool for creating or updating an adherence pattern. Accepts filters (past values) and data (present values).',
		schema: AdherencePatternAISchema,
		func: async ({ filters, data }) => {
			const id = new Types.ObjectId();
			this.eventEmitter.emit('adherencePattern.persist', { filters, data });
			return id.toString();
		},
	});

	private chronicCondition = new DynamicStructuredTool({
		name: 'chronicConditionsScribe',
		description:
			'Tool for creating or updating a chronic condition. Accepts filters (past values) and data (present values).',
		schema: ChronicConditionAISchema,
		func: async ({ filters, data }) => {
			const id = new Types.ObjectId();
			this.eventEmitter.emit('chronicCondition.persist', { filters, data });
			return id.toString();
		},
	});

	private concern = new DynamicStructuredTool({
		name: 'concernsScribe',
		description:
			'Tool for creating or updating a patient concern. Accepts filters (past values) and data (present values).',
		schema: ConcernAISchema,
		func: async ({ filters, data }) => {
			const id = new Types.ObjectId();
			this.eventEmitter.emit('concern.persist', { filters, data });
			return id.toString();
		},
	});

	private medication = new DynamicStructuredTool({
		name: 'medicationsScribe',
		description:
			'Tool for creating or updating a medication record. Accepts filters (past values) and data (present values).',
		schema: MedicationAISchema,
		func: async ({ filters, data }) => {
			const id = new Types.ObjectId();
			this.eventEmitter.emit('medication.persist', { filters, data });
			return id.toString();
		},
	});

	private patient = new DynamicStructuredTool({
		name: 'patientsScribe',
		description:
			'Tool for creating or updating a patient record. Accepts filters (identity) and data (present values).',
		schema: PatientAISchema,
		func: async ({ filters, data }) => {
			const id = new Types.ObjectId();
			this.eventEmitter.emit('patient.persist', { filters, data });
			return id.toString();
		},
	});

	private vitalHistory = new DynamicStructuredTool({
		name: 'vitalHistoriesScribe',
		description:
			'Tool for creating or updating a vital history record. Accepts filters (identity) and data (upsert).',
		schema: VitalHistoryAISchema,
		func: async ({ filters, data }) => {
			const id = new Types.ObjectId();
			this.eventEmitter.emit('vitalHistory.persist', { filters, data });
			return id.toString();
		},
	});

	private augury = new DynamicStructuredTool({
		name: 'notificationsScribe',
		description:
			'Tool for creating or updating a notification. Accepts filters (past values) and data (present values).',
		schema: NotificationUpsertRequestSchema,
		func: async ({ filters, data }) => {
			const id = new Types.ObjectId();
			this.eventEmitter.emit('notification.persist', { filters, data });
			return id.toString();
		},
	});

	@OnEvent('adherenceLog.persist')
	async adherenceLogEvent(payload: {
		filters: AdherenceLogIdentity;
		data: AdherenceLogUpsertInput;
	}) {
		try {
			const { filters, data } = payload;
			return this.adherencesService.upsertAdherenceLog(filters, data);
		} catch (error) {
			this.logger.error('Error persisting adherence log', { payload, error });
		}
	}

	@OnEvent('adherencePattern.persist')
	async adherencePatternEvent(payload: {
		filters: AdherencePatternIdentity;
		data: AdherencePatternUpsertInput;
	}) {
		try {
			const { filters, data } = payload;
			return this.adherencesService.upsertAdherencePattern(filters, data);
		} catch (error) {
			this.logger.error('Error persisting adherence pattern', {
				payload,
				error,
			});
		}
	}

	@OnEvent('chronicCondition.persist')
	async chronicConditionEvent(payload: {
		filters: ChronicConditionIdentity;
		data: ChronicConditionUpsertInput;
	}) {
		try {
			const { filters, data } = payload;
			return this.chronicConditionsService.upsertChronicCondition(
				filters,
				data,
			);
		} catch (error) {
			this.logger.error('Error persisting chronic condition', {
				payload,
				error,
			});
		}
	}

	@OnEvent('concern.persist')
	async concernEvent(payload: {
		filters: ConcernIdentity;
		data: ConcernUpsertInput;
	}) {
		try {
			const { filters, data } = payload;
			return this.concernsService.upsertConcern(filters, data);
		} catch (error) {
			this.logger.error('Error persisting concern', { payload, error });
		}
	}

	@OnEvent('medication.persist')
	async medicationEvent(payload: {
		filters: MedicationIdentity;
		data: MedicationUpsertInput;
	}) {
		try {
			const { filters, data } = payload;
			return this.medicationsService.upsertMedication(filters, data);
		} catch (error) {
			this.logger.error('Error persisting medication', { payload, error });
		}
	}

	@OnEvent('patient.persist')
	async patientEvent(payload: {
		filters: PatientIdentity;
		data: PatientUpsertInput;
	}) {
		try {
			const { filters, data } = payload;
			return this.patientsService.upsertPatient(filters, data);
		} catch (error) {
			this.logger.error('Error persisting patient', { payload, error });
		}
	}

	@OnEvent('vitalHistory.persist')
	async vitalHistoryEvent(payload: {
		filters: VitalHistoryIdentity;
		data: VitalHistoryUpsertInput;
	}) {
		try {
			const { filters, data } = payload;
			return this.vitalHistoriesService.upsertVitalHistory(filters, data);
		} catch (error) {
			this.logger.error('Error persisting vital history', { payload, error });
		}
	}

	@OnEvent('notification.persist')
	async notificationEvent(payload: {
		filters: NotificationFilterDto;
		data: UpsertNotificationDto;
	}) {
		try {
			const { filters, data } = payload;
			return this.notificationsService.upsertNotification(filters, data);
		} catch (error) {
			this.logger.error('Error persisting notification', { payload, error });
		}
	}
}
