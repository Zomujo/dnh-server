import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';

export class CreateMedicationDto {}

export class MedicationNotificationChoiceDto {
	@ApiProperty({ example: 'yes', enum: ['yes', 'no'] })
	@IsNotEmpty()
	@IsEnum(['yes', 'no'])
	choice: 'yes' | 'no';
}
