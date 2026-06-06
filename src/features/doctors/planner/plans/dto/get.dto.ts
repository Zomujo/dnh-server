import { IntersectionType } from '@nestjs/swagger';
import { GenericResponseDto, PaginationRequestDto } from '@/common/dto';
import { PlanDto } from './plan.dto';

export class GetPlannerPlanDto extends IntersectionType(
	PlanDto,
	GenericResponseDto,
) {}

export class GetPlannerPlanQueryDto extends PaginationRequestDto {}
