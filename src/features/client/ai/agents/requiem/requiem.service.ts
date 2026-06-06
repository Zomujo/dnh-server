import {
	ChatPromptTemplate,
	MessagesPlaceholder,
} from '@langchain/core/prompts';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { Injectable } from '@nestjs/common';
import { ObjectId } from 'mongoose';
import { AdherencesService } from '@/features/adherences/adherences.service';
import {
	AdherenceLogQueryFilter,
	AdherenceLogQuerySchema,
	AdherencePatternQueryFilter,
	AdherencePatternQuerySchema,
} from '@/features/adherences/dto';
import { ChronicConditionsService } from '@/features/chronic-conditions/chronic-conditions.service';
import {
	ChronicConditionQueryFilter,
	ChronicConditionQuerySchema,
} from '@/features/chronic-conditions/dto';
import { ClientAIState, getUserTimezone } from '@/features/client/ai/states';
import { ConcernsService } from '@/features/concerns/concerns.service';
import {
	ConcernQueryFilter,
	ConcernQuerySchema,
} from '@/features/concerns/dto';
import {
	MedicationQueryFilter,
	MedicationQuerySchema,
} from '@/features/medications/dto';
import { MedicationsService } from '@/features/medications/medications.service';
import {
	PatientQueryFilter,
	PatientQuerySchema,
} from '@/features/patients/dto';
import { PatientsService } from '@/features/patients/patients.service';
import {
	VitalHistoryQueryFilter,
	VitalHistoryQuerySchema,
} from '@/features/vital-histories/dto';
import { VitalHistoriesService } from '@/features/vital-histories/vital-histories.service';
import { REQUIEM_PROMPT } from './state';

@Injectable()
export class RequiemService {
	constructor(
		private readonly adherencesService: AdherencesService,
		private readonly chronicConditionsService: ChronicConditionsService,
		private readonly concernsService: ConcernsService,
		private readonly medicationsService: MedicationsService,
		private readonly patientsService: PatientsService,
		private readonly vitalHistoriesService: VitalHistoriesService,
	) {}

	private get model() {
		return new ChatGoogleGenerativeAI({
			model: process.env.GOOGLE_AI_VERSION ?? 'gemini-2.5-flash',
			temperature: 0.7,
		});
	}

	async remember(state: typeof ClientAIState.State) {
		const promptTemplate = ChatPromptTemplate.fromMessages([
			['system', REQUIEM_PROMPT],
			new MessagesPlaceholder('messages'),
		]);
		const prompt = await promptTemplate.invoke({
			userId: state.user?.userId,
			patientId: state.user?.patientId,
			name: state.user?.name,
			phoneNumber: state.user?.phoneNumber,
			language: state.user?.language,
			timezoneContext: getUserTimezone(),
			messages: state.messages.slice(-5),
		});

		const tools = [
			this.adherenceLog() as any,
			this.adherencePattern() as any,
			this.chronicCondition() as any,
			this.concern() as any,
			this.medication() as any,
			this.patient() as any,
			this.vitalHistory() as any,
		];
		const toolNode = new ToolNode(tools);

		const requiemComposer = this.model.bindTools(tools);
		const response = await requiemComposer.invoke(prompt);

		if (process.env.NODE_ENV === 'development') {
			// console.log('Requiem response:', response);
			console.log('Requiem tool calls:', response.tool_calls);
		}

		const result = await toolNode.invoke({ messages: [response] });
		console.log("Requiem's tool call result", result);

		return { toolMessages: result.messages };
	}

	private adherenceLog() {
		return new DynamicStructuredTool<
			typeof AdherenceLogQuerySchema,
			AdherenceLogQueryFilter,
			AdherenceLogQueryFilter,
			string
		>({
			name: 'adherenceLogsCall',
			description:
				'Tool for querying adherence log data from MongoDB. Use this when the user asks about patient medication adherence events or log history.',
			schema: AdherenceLogQuerySchema,
			func: async (params: AdherenceLogQueryFilter) => {
				const response =
					await this.adherencesService.findAllAdherenceLogsByQuery(params);
				return JSON.stringify(response);
			},
		});
	}

	private adherencePattern() {
		return new DynamicStructuredTool<
			typeof AdherencePatternQuerySchema,
			AdherencePatternQueryFilter,
			AdherencePatternQueryFilter,
			string
		>({
			name: 'adherencePatternsCall',
			description:
				'Tool for querying adherence pattern data from MongoDB. Use this when the user asks about medication-taking trends, patterns, or consistency over time.',
			schema: AdherencePatternQuerySchema,
			func: async (params: AdherencePatternQueryFilter) => {
				const response =
					await this.adherencesService.findAllAdherencePatternsByQuery(params);
				return JSON.stringify(response);
			},
		});
	}

	private chronicCondition() {
		return new DynamicStructuredTool<
			typeof ChronicConditionQuerySchema,
			ChronicConditionQueryFilter,
			ChronicConditionQueryFilter,
			string
		>({
			name: 'chronicConditionsCall',
			description:
				'Tool for querying chronic condition data from MongoDB. Use this when the user asks about a patient’s diagnosed long-term health conditions or related details.',
			schema: ChronicConditionQuerySchema,
			func: async (params: ChronicConditionQueryFilter) => {
				const response =
					await this.chronicConditionsService.findAllByQuery(params);
				return JSON.stringify(response);
			},
		});
	}

	private concern() {
		return new DynamicStructuredTool<
			typeof ConcernQuerySchema,
			ConcernQueryFilter,
			ConcernQueryFilter,
			string
		>({
			name: 'concernsCall',
			description:
				'Tool for querying patient concern data from MongoDB. Use this when the user asks about specific issues, complaints, or reported health concerns from patients.',
			schema: ConcernQuerySchema,
			func: async (params: ConcernQueryFilter) => {
				const response = await this.concernsService.findAllByQuery(params);
				return JSON.stringify(response);
			},
		});
	}

	private medication() {
		return new DynamicStructuredTool<
			typeof MedicationQuerySchema,
			MedicationQueryFilter,
			MedicationQueryFilter,
			string
		>({
			name: 'medicationsCall',
			description:
				'Tool for querying medication data from MongoDB. Use this when the user asks about prescribed medications, dosages, schedules, or drug-related information.',
			schema: MedicationQuerySchema,
			func: async (params: MedicationQueryFilter) => {
				const response = await this.medicationsService.findAllByQuery(params);
				return JSON.stringify(response);
			},
		});
	}

	private patient() {
		return new DynamicStructuredTool<
			typeof PatientQuerySchema,
			PatientQueryFilter,
			PatientQueryFilter,
			string
		>({
			name: 'patientsCall',
			description:
				'Tool for querying patient data from MongoDB. Use this when the user asks for patient information, profiles, demographics, or identity-based searches.',
			schema: PatientQuerySchema,
			func: async (params: PatientQueryFilter) => {
				const response = await this.patientsService.findAllByQuery(params);
				return JSON.stringify(response);
			},
		});
	}

	private vitalHistory() {
		return new DynamicStructuredTool<
			typeof VitalHistoryQuerySchema,
			VitalHistoryQueryFilter,
			VitalHistoryQueryFilter,
			ObjectId | string
		>({
			name: 'vitalHistoriesCall',
			description:
				'Tool for querying vital history data from MongoDB. Use this when the user asks about recorded vitals such as blood pressure, pulse, blood sugar, or other health measurements over time.',
			schema: VitalHistoryQuerySchema,
			func: async (params: VitalHistoryQueryFilter) => {
				const response =
					await this.vitalHistoriesService.findAllByQuery(params);
				return JSON.stringify(response);
			},
		});
	}
}
