import { ServiceUnavailableException } from '@nestjs/common';
import {
	assertAiConfigured,
	createGeminiChatModel,
	isAiConfigured,
	isTranscriptionConfigured,
	isVectorStoreConfigured,
} from './ai-features';

describe('ai-features', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('treats unset or blank keys as not configured', () => {
		vi.stubEnv('GOOGLE_API_KEY', ' ');
		vi.stubEnv('OPENAI_API_KEY', '');
		vi.stubEnv('QDRANT_URL', 'http://qdrant.test:6333');

		expect(isAiConfigured()).toBe(false);
		expect(isTranscriptionConfigured()).toBe(false);
		// Embeddings need Gemini, so Qdrant alone is not enough.
		expect(isVectorStoreConfigured()).toBe(false);
		expect(() => assertAiConfigured()).toThrow(ServiceUnavailableException);
		expect(() => createGeminiChatModel()).toThrow(ServiceUnavailableException);
	});

	it('reports each feature configured once its keys are set', () => {
		vi.stubEnv('GOOGLE_API_KEY', 'test-key');
		vi.stubEnv('OPENAI_API_KEY', 'test-key');
		vi.stubEnv('QDRANT_URL', 'http://qdrant.test:6333');

		expect(isAiConfigured()).toBe(true);
		expect(isTranscriptionConfigured()).toBe(true);
		expect(isVectorStoreConfigured()).toBe(true);
		expect(() => assertAiConfigured()).not.toThrow();
		expect(createGeminiChatModel().model).toContain('gemini');
	});
});
