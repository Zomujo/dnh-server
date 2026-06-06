import { ApiProperty, ApiResponseProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional } from 'class-validator';

export interface IConfig {
	configurable: { thread_id: string };
}

const EmptyToUndefined = () =>
	Transform(({ value }) => (value === '' ? undefined : value));

export class CreateChronicCareDto {
	@ApiProperty({
		example: 'Hello',
		description: 'The message to be sent to the AI',
	})
	@IsOptional()
	@EmptyToUndefined()
	message: string;
}

export class ChronicCareConversationResponseDto {
	@ApiResponseProperty({
		example: {
			_id: '69428d88795e426748689856',
			text: 'Hi there pleasure to meet you',
			createdAt: new Date(),
		},
	})
	outResponse: {
		_id: string;
		text: string;
		createdAt: Date;
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
