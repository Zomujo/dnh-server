import { PickType } from '@nestjs/swagger';
import { FacilityDto } from './facility.dto';

export class CreateFacilityDto extends PickType(FacilityDto, [
	'name',
	'phoneNumber',
]) {}
