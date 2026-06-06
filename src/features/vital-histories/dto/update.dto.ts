import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateVitalHistoryDto } from './create.dto';

export class UpdateVitalHistoryDto extends PartialType(
	OmitType(CreateVitalHistoryDto, ['patient']),
) {}
