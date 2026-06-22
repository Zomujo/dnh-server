import { PickType } from '@nestjs/swagger';
import { PaginationRequestDto } from '@/common/dto';
import { FacilityDto } from './facility.dto';

export class GetFacilityDto extends FacilityDto {}

export class GetFacilitiesQueryDto extends PickType(PaginationRequestDto, [
	'page',
	'pageSize',
]) {}
