import { ServiceUnavailableException } from '@nestjs/common';
import { TestBed } from '@suites/unit';
import { Types } from 'mongoose';
import { AI_UNAVAILABLE_MESSAGE } from '@/common/utils/ai-features';
import { SupportedLanguages } from './ai/states';
import { ClientService } from './client.service';

describe('ClientService AI chat with the AI not configured', () => {
	let service: ClientService;
	let deps: Record<string, any>;
	const voiceNote = {
		buffer: Buffer.from('x'),
		originalname: 'a.m4a',
	} as Express.Multer.File;

	beforeEach(async () => {
		vi.stubEnv('GOOGLE_API_KEY', '');
		vi.stubEnv('OPENAI_API_KEY', '');
		const { unit } = await TestBed.solitary(ClientService).compile();
		service = unit;
		deps = service as any;
		deps.clientAIChatService.countChatsForPatient = vi
			.fn()
			.mockResolvedValue(0);
		deps.clientAIChatService.findByLocalChatId = vi
			.fn()
			.mockResolvedValue(null);
		deps.retrievePatient = vi
			.fn()
			.mockResolvedValue({ _id: new Types.ObjectId(), name: 'Ama' });
		deps.retrieveChronicConditions = vi.fn().mockResolvedValue([]);
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('answers a new text message with 503 "unavailable", not a crash', async () => {
		const chat = service.chat(
			{ message: 'Hello' },
			'user-1',
			SupportedLanguages.ENGLISH,
		);

		await expect(chat).rejects.toBeInstanceOf(ServiceUnavailableException);
		await expect(chat).rejects.toThrow(AI_UNAVAILABLE_MESSAGE);
		expect(deps.clientAiService.bulkCompletion).not.toHaveBeenCalled();
	});

	it('answers a voice note with 503 before transcribing it', async () => {
		await expect(
			service.chatAudio(
				voiceNote,
				'user-1',
				SupportedLanguages.ENGLISH,
				'audio-1',
			),
		).rejects.toBeInstanceOf(ServiceUnavailableException);
		expect(deps.extClientAiService.transcibeAudio).not.toHaveBeenCalled();
	});

	it('answers a voice note with 503 when only Whisper is missing', async () => {
		vi.stubEnv('GOOGLE_API_KEY', 'test-key');

		await expect(
			service.chatAudio(
				voiceNote,
				'user-1',
				SupportedLanguages.ENGLISH,
				'audio-1',
			),
		).rejects.toBeInstanceOf(ServiceUnavailableException);
		expect(deps.extClientAiService.transcibeAudio).not.toHaveBeenCalled();
	});
});
