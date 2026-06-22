import { PartialType } from '@nestjs/swagger';
import { CreateFacilityDto } from './create.dto';

export class UpdateFacilityDto extends PartialType(CreateFacilityDto) {}
