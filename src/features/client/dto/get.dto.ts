import {
	ApiPropertyOptional,
	ApiResponseProperty,
	PartialType,
	PickType,
} from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { GenericResponseDto, PaginationRequestDto } from '@/common/dto';
import type { Nullable } from '@/common/types';
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

export class PreloadedMedsQueryDto extends PickType(PaginationRequestDto, [
	'page',
]) {
	@ApiPropertyOptional({ default: 10, name: 'limit' })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Expose({ name: 'limit' })
	pageSize: number;

	@ApiPropertyOptional({
		description: 'Search by medication name (prefix match)',
	})
	@IsOptional()
	@IsString()
	search?: string;
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

export class MedicationAdherenceDayDto {
	@ApiResponseProperty({ example: true })
	taken: Nullable<boolean>;

	@ApiResponseProperty({ example: '2026-06-08T00:00:00.000Z' })
	dateTaken: Date;

	@ApiResponseProperty({ example: 'M' })
	label: string;
}

export class MedicationAdherenceDto {
	@ApiResponseProperty({ example: 85 })
	rate: number;

	@ApiResponseProperty({ type: [MedicationAdherenceDayDto] })
	days?: MedicationAdherenceDayDto[];
}

/** Per-kind counts of what DELETE /client/clean removed; all 0 on a repeat. */
export class AccountDeletionCountsDto {
	@ApiResponseProperty({ example: 1 })
	patient: number;

	@ApiResponseProperty({ example: 3 })
	medications: number;

	@ApiResponseProperty({ example: 0 })
	adherenceLogs: number;

	@ApiResponseProperty({ example: 0 })
	adherencePatterns: number;

	@ApiResponseProperty({ example: 42 })
	vitals: number;

	@ApiResponseProperty({ example: 0 })
	symptoms: number;

	@ApiResponseProperty({ example: 0 })
	chronicConditions: number;

	@ApiResponseProperty({ example: 0 })
	summaries: number;

	@ApiResponseProperty({ example: 0 })
	reminders: number;

	@ApiResponseProperty({ example: 0 })
	appointments: number;

	@ApiResponseProperty({ example: 0 })
	appointmentRequests: number;

	@ApiResponseProperty({ example: 0 })
	chatRooms: number;

	@ApiResponseProperty({ example: 0 })
	chatMessages: number;

	@ApiResponseProperty({ example: 0 })
	aiChatMessages: number;

	@ApiResponseProperty({ example: 0 })
	aiConversationState: number;

	@ApiResponseProperty({ example: 0 })
	voiceNoteFiles: number;

	@ApiResponseProperty({ example: 0 })
	fcmTokens: number;

	@ApiResponseProperty({ example: 0 })
	firestoreDocuments: number;

	@ApiResponseProperty({ example: 1 })
	authUser: number;
}

export class AccountDeletionResponseDto {
	@ApiResponseProperty({ type: AccountDeletionCountsDto })
	deleted: AccountDeletionCountsDto;
}

export class MessagesPayload {
	@ApiPropertyOptional({ example: ['hi'] })
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	messages: string[];
}
