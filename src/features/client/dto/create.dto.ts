import {
	ApiProperty,
	ApiPropertyOptional,
	ApiResponseProperty,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export interface IConfig {
	configurable: { thread_id: string };
}

const EmptyToUndefined = () =>
	Transform(({ value }) => (value === '' ? undefined : value));

export const MAX_CHAT_MESSAGE_LENGTH = 2000;

export class CreateChronicCareDto {
	@ApiProperty({
		example: 'Hello',
		description:
			'The message to be sent to the AI. Empty starts the conversation; once the chat has messages an empty message returns 204 with no body.',
		maxLength: MAX_CHAT_MESSAGE_LENGTH,
	})
	@IsOptional()
	@EmptyToUndefined()
	@IsString()
	@MaxLength(MAX_CHAT_MESSAGE_LENGTH)
	message: string;

	@ApiPropertyOptional({
		description:
			'Client-generated id (UUID) for this message. Stored on it and returned in inResponse and history, so the message can be deleted by it; resending the same id returns the original reply instead of asking the AI again.',
		example: '0b7f6c1e-3f0e-4a8e-9a55-0f6a7c1d2e3f',
	})
	@IsOptional()
	@IsUUID()
	localChatId?: string;
}

export class ChronicCareConversationResponseDto {
	@ApiResponseProperty({
		example: {
			_id: '69428d88795e426748689856',
			text: 'Hi there pleasure to meet you',
			createdAt: new Date(),
			suggestions: [],
		},
	})
	outResponse: {
		_id: string;
		text: string;
		createdAt: Date;
		suggestions: string[];
	};

	@ApiResponseProperty({
		example: { _id: '69428d88795e426748689856', createdAt: new Date() },
	})
	inResponse: {
		_id: string;
		createdAt: Date;
	};
}

export class AudioUploadDto {
	@ApiProperty({ type: 'string', format: 'binary' })
	file: any;
}

export type ChatTypes = 'text' | 'audio';

export class UserPayload {
	name: string;
	phoneNumber: string;
}
