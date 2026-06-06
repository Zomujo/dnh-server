import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional } from 'class-validator';

export enum DHDocumentType {
	ADHERENCE_LOG = 'AdherenceLog',
	ADHERENCE_PATTERN = 'AdherencePattern',
	CHRONIC_CONDITION = 'ChronicCondition',
	CONCERN = 'Concern',
	MEDICATION = 'Medication',
	NOTIFICATION = 'AugurNotification',
	PATIENT = 'Patient',
	VITAL_HISTORY = 'VitalHistory',
}
export class CreateDhVectorDto {
	@ApiProperty()
	@IsOptional()
	qdrantId?: string;

	@ApiProperty()
	@IsNotEmpty()
	userId: string;

	@ApiProperty()
	@IsNotEmpty()
	patient: string;

	@ApiProperty()
	@IsNotEmpty()
	@IsEnum(DHDocumentType)
	documentType: DHDocumentType;

	@ApiProperty()
	@IsNotEmpty()
	documentId: string;

	@ApiProperty()
	@IsNotEmpty()
	summary: string;
}
