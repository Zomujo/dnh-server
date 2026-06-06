import { BaseMessage, ToolMessage } from '@langchain/core/messages';

import { Annotation, messagesStateReducer } from '@langchain/langgraph';
import { PatientPayload } from '../../../patients/dto';
import { type ArchonenDecision } from '../agents/archonen/state';
import { type AiInsights } from '../agents/chronicleer/state';
import {
	ConversationScope,
	ConversationScopes,
} from '../agents/disquisitioner/state';

export enum SupportedLanguages {
	ENGLISH = 'English',
	TWI = 'Twi',
	FRENCH = 'French',
	PIDGIN = 'Pidgin',
}

// Define the User type
export interface PatientState {
	userId: string;
	patientId: string;
	name: string;
	phoneNumber: string;
	language: string;
}
export type ClientAIContext = { user: PatientState };
export interface ClientAICompletionInput {
	message: string;
	userId: string;
	chatType?: string;
	language: string;
	patient: PatientPayload;
}

export const ClientAIState = Annotation.Root({
	user: Annotation<PatientState | null>({
		reducer: (current, update) => {
			return current ? { ...current, ...update } : update;
		},
		default: () => null,
	}),
	archonenRoutes: Annotation<ArchonenDecision>,
	messages: Annotation<BaseMessage[]>({
		reducer: messagesStateReducer,
		default: () => [],
	}),
	humanMessages: Annotation<BaseMessage[]>({
		reducer: messagesStateReducer,
		default: () => [],
	}),
	toolMessages: Annotation<ToolMessage[]>({
		reducer: (_, y) => y,
		default: () => [],
	}),

	summary: Annotation<AiInsights | null>,
	conversationScope: Annotation<ConversationScope>({
		reducer: (_, y) => y,
		default: () => ConversationScopes[0],
	}),
	nextConversationScope: Annotation<ConversationScope>({
		reducer: (_, y) => y,
		default: () => ConversationScopes[1],
	}),
	questions: Annotation<string[]>({
		reducer: (_, y) => y,
		default: () => [],
	}),
	previousQuestion: Annotation<string[]>({
		reducer: (_, y) => y,
		default: () => [],
	}),
	allQuestionsAsked: Annotation<boolean>({
		reducer: (_, y) => y,
		default: () => false,
	}),
});

function isValidTimeZone(timezoneStr: string) {
	if (!timezoneStr) {
		return false;
	}
	try {
		new Intl.DateTimeFormat('en', { timeZone: timezoneStr }).format();
		return true;
	} catch (error) {
		if (error instanceof RangeError) {
			return false;
		}
		return false;
	}
}

export function getUserTimezone(userTimeZone: string = 'Africa/Accra') {
	const isValid = isValidTimeZone(userTimeZone);
	let effectiveTimeZone: string;

	if (isValid) {
		effectiveTimeZone = userTimeZone;
	} else {
		effectiveTimeZone = 'Africa/Accra';
		console.warn(
			`Invalid timezone provided: "${userTimeZone}". Falling back to ${effectiveTimeZone}.`,
		);
	}

	const now = new Date();

	const currentDateTime = now.toLocaleString('en-US', {
		timeZone: effectiveTimeZone,
		hour: 'numeric',
		minute: 'numeric',
		second: 'numeric',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		timeZoneName: 'long',
	});

	const timezoneContext = `The user's current timezone is ${effectiveTimeZone}. The current date and time in their location is: ${currentDateTime}.`;

	return timezoneContext;
}
