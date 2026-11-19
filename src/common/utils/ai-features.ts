import {
	ChatGoogleGenerativeAI,
	GoogleGenerativeAIChatInput,
} from '@langchain/google-genai';
import { ServiceUnavailableException } from '@nestjs/common';

/**
 * The AI features (Gemini assistant and embeddings, Whisper transcription,
 * the Qdrant vector store) are retired for now but kept in the code. The
 * server must run without any of their configuration, so every AI client is
 * built only when its env vars are present, and callers check these first.
 */

export const AI_UNAVAILABLE_MESSAGE =
	'AI features are not enabled on this server';

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

/** Gemini (chat and embeddings) can be used: GOOGLE_API_KEY is set. */
export function isAiConfigured(): boolean {
	return !!process.env.GOOGLE_API_KEY?.trim();
}

/** Whisper transcription can be used: OPENAI_API_KEY is set. */
export function isTranscriptionConfigured(): boolean {
	return !!process.env.OPENAI_API_KEY?.trim();
}

/**
 * The vector store can be used: Qdrant is configured, and so is Gemini,
 * which makes the embeddings that are stored and searched.
 */
export function isVectorStoreConfigured(): boolean {
	return !!process.env.QDRANT_URL?.trim() && isAiConfigured();
}

/** Throws a 503 when the Gemini features are not configured. */
export function assertAiConfigured(): void {
	if (!isAiConfigured()) {
		throw new ServiceUnavailableException(AI_UNAVAILABLE_MESSAGE);
	}
}

/**
 * A Gemini chat model on GOOGLE_AI_VERSION (gemini-2.5-flash by default).
 * Throws a 503 when GOOGLE_API_KEY is not set, instead of the client's own
 * constructor error, so AI-only endpoints answer "unavailable".
 */
export function createGeminiChatModel(
	fields: Partial<GoogleGenerativeAIChatInput> = {},
): ChatGoogleGenerativeAI {
	assertAiConfigured();
	return new ChatGoogleGenerativeAI({
		model: process.env.GOOGLE_AI_VERSION || DEFAULT_GEMINI_MODEL,
		...fields,
	});
}
