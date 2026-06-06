import { IntersectionType } from '@nestjs/swagger';
import { GenericResponseDto, PaginationRequestDto } from '@/common/dto';
import { PlannerSessionDto } from './sessions.dto';

export class GetPlannerSessionDto extends IntersectionType(
	PlannerSessionDto,
	GenericResponseDto,
) {}

export class GetPlannerSessionQueryDto extends PaginationRequestDto {}
