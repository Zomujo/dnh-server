import { TestBed } from '@suites/unit';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Types } from 'mongoose';
import { SupportedLanguages } from './ai/states';
import { ClientService } from './client.service';
import { ChronicChatMessagesQueryDto, CreateChronicCareDto } from './dto';

describe('ClientService.chat resend by localChatId', () => {
	let service: ClientService;
	let deps: Record<string, any>;
	const localChatId = '0b7f6c1e-3f0e-4a8e-9a55-0f6a7c1d2e3f';

	beforeEach(async () => {
		const { unit } = await TestBed.solitary(ClientService).compile();
		service = unit;
		deps = service as any;
		deps.clientAIChatService.countChatsForPatient = vi
			.fn()
			.mockResolvedValue(3);
		deps.retrievePatient = vi
			.fn()
			.mockResolvedValue({ _id: new Types.ObjectId(), name: 'Ama' });
		deps.retrieveChronicConditions = vi.fn().mockResolvedValue([]);
		deps.clientAiService.bulkCompletion = vi
			.fn()
			.mockResolvedValue({ outResponse: { _id: 'new' }, inResponse: {} });
	});

	it('returns the original pair without calling the AI again', async () => {
		const sentAt = new Date('2026-10-20T10:00:00Z');
		deps.clientAIChatService.findByLocalChatId = vi
			.fn()
			.mockResolvedValue({ id: 'user-msg', createdAt: sentAt });
		deps.clientAIChatService.findReplyTo = vi.fn().mockResolvedValue({
			id: 'ai-msg',
			content: 'Drink water',
			createdAt: sentAt,
		});

		const result = await service.chat(
			{ message: 'hi', localChatId },
			'user-1',
			SupportedLanguages.ENGLISH,
		);

		expect(deps.clientAIChatService.findByLocalChatId).toHaveBeenCalledWith(
			'user-1',
			localChatId,
		);
		expect(deps.clientAiService.bulkCompletion).not.toHaveBeenCalled();
		expect(result).toEqual({
			outResponse: {
				_id: 'ai-msg',
				text: 'Drink water',
				createdAt: sentAt,
				suggestions: [],
			},
			inResponse: { _id: 'user-msg', createdAt: sentAt, localChatId },
		});
	});

	it('drops a saved message that never got a reply and answers afresh', async () => {
		deps.clientAIChatService.findByLocalChatId = vi
			.fn()
			.mockResolvedValue({ id: 'user-msg', createdAt: new Date() });
		deps.clientAIChatService.findReplyTo = vi.fn().mockResolvedValue(null);
		deps.clientAIChatService.deleteById = vi.fn().mockResolvedValue(null);

		await service.chat(
			{ message: 'hi', localChatId },
			'user-1',
			SupportedLanguages.ENGLISH,
		);

		expect(deps.clientAIChatService.deleteById).toHaveBeenCalledWith(
			'user-msg',
			'user-1',
		);
		expect(deps.clientAiService.bulkCompletion).toHaveBeenCalledWith(
			expect.objectContaining({ localChatId }),
		);
	});

	it('passes a new localChatId through to be stored', async () => {
		deps.clientAIChatService.findByLocalChatId = vi
			.fn()
			.mockResolvedValue(null);

		await service.chat(
			{ message: 'hi', localChatId },
			'user-1',
			SupportedLanguages.TWI,
		);

		expect(deps.clientAiService.bulkCompletion).toHaveBeenCalledWith(
			expect.objectContaining({ message: 'hi', localChatId }),
		);
	});
});

describe('chat DTOs', () => {
	const errors = async (cls: any, plain: object) =>
		(await validate(plainToInstance(cls, plain))).flatMap((e) =>
			Object.keys(e.constraints ?? {}),
		);

	it('caps message length at 2000', async () => {
		expect(
			await errors(CreateChronicCareDto, { message: 'a'.repeat(2000) }),
		).toEqual([]);
		expect(
			await errors(CreateChronicCareDto, { message: 'a'.repeat(2001) }),
		).toContain('maxLength');
	});

	it('requires localChatId to be a UUID when sent', async () => {
		expect(
			await errors(CreateChronicCareDto, { message: 'hi', localChatId: 'abc' }),
		).toContain('isUuid');
	});

	it('caps the history page size at 100', async () => {
		expect(await errors(ChronicChatMessagesQueryDto, { limit: '100' })).toEqual(
			[],
		);
		expect(
			await errors(ChronicChatMessagesQueryDto, { limit: '101' }),
		).toContain('max');
	});

	it('only offers English and Twi', () => {
		expect(Object.values(SupportedLanguages)).toEqual(['English', 'Twi']);
	});
});
