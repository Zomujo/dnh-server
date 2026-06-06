import { IntersectionType, PickType } from '@nestjs/swagger';
import { GenericResponseDto } from '@/common/dto';
import { ChronicConditionDto } from './chronic-condition.dto';

export class GetChronicConditionDto extends IntersectionType(
	PickType(ChronicConditionDto, [
		'conditionName',
		'diagnosedBy',
		'diagnosedDate',
		'currentStatus',
	]),
	PickType(GenericResponseDto, ['id']),
) {}
