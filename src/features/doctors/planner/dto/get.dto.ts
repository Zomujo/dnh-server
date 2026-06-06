import { IntersectionType } from '@nestjs/swagger';
import { GenericResponseDto, PaginationRequestDto } from '@/common/dto';
import { PlannerChatDto } from './planner-chat.dto';

export class GetPlannerChatDto extends IntersectionType(
	PlannerChatDto,
	GenericResponseDto,
) {}

export class GetPlannerChatQueryDto extends PaginationRequestDto {}
