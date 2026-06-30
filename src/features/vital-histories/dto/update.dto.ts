import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { VitalSeverityEnum } from '../entities/vital-history.entity';
import { CreateVitalHistoryDto } from './create.dto';

export class UpdateVitalHistoryDto extends PartialType(
	OmitType(CreateVitalHistoryDto, ['patient']),
) {}

export class UpdateVitalLogDto {
	@ApiPropertyOptional({ enum: VitalSeverityEnum, example: 'normal' })
	@IsOptional()
	@IsEnum(VitalSeverityEnum)
	severity?: VitalSeverityEnum;

	@ApiPropertyOptional({ example: 'Patient is stable' })
	@IsOptional()
	@IsString()
	notes?: string;
}
