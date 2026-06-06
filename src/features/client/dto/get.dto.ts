import {
	ApiPropertyOptional,
	ApiResponseProperty,
	PartialType,
	PickType,
} from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { GenericResponseDto, PaginationRequestDto } from '@/common/dto';
import { AIMessageRole as ChronicCareMessageRole } from '@/features/client/ai/entities/ai-chat.entity';

export class ChronicCareQueryDto extends PickType(PaginationRequestDto, [
	'page',
	'pageSize',
]) {}

export class ChronicChatMessagesQueryDto extends PickType(
	PaginationRequestDto,
	['page'],
) {
	@ApiPropertyOptional({ default: 10, name: 'limit' })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Expose({ name: 'limit' })
	pageSize: number;
}

export class ChronicCareChatMessageDto extends PartialType(GenericResponseDto) {
	@ApiResponseProperty({ example: 'assistant', enum: ChronicCareMessageRole })
	role: ChronicCareMessageRole;

	@ApiResponseProperty({
		example:
			'I am terribly sorry for what happened to you. How did that affect you now?',
	})
	content: string;

	@ApiResponseProperty({
		example: 'text',
		enum: ['text', 'audio'],
	})
	type: string;

	@ApiResponseProperty({
		example: '1765185534716',
	})
	localChatId: string;
}

export class MessagesPayload {
	@ApiPropertyOptional({ example: ['hi'] })
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	messages: string[];
}
