import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
	IsEnum,
	IsInt,
	IsMongoId,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsPositive,
	IsString,
	Length,
	Max,
	Min,
} from 'class-validator';

enum DiagnosedByEnum {
	DOCTOR = 'doctor',
	PHARMACIST = 'pharmacist',
	AI = 'ai',
	NURSE = 'nurse',
	LAB_TECHNICIAN = 'lab_technician',
	THERAPIST = 'therapist',
	OTHER = 'other',
}
class DiagnosedDate {
	@ApiPropertyOptional({
		description: 'Day of month',
		example: 10,
	})
	@IsOptional()
	@IsNumber()
	@IsInt()
	@IsPositive()
	@Min(1)
	@Max(31)
	day?: number;

	@ApiPropertyOptional({
		description: 'Month number',
		example: 5,
	})
	@IsOptional()
	@IsNumber()
	@IsInt()
	@Min(1)
	@Max(12)
	month?: number;

	@ApiProperty({
		description: 'Four-digit year',
		example: 2023,
	})
	@IsInt()
	@IsPositive()
	year: number;
}
export class ChronicConditionDto {
	@ApiProperty({
		description: 'User ID associated with the chronic condition',
		example: 'user_12345',
	})
	@IsString()
	@IsNotEmpty()
	@Length(3, 50)
	userId: string;

	@ApiProperty({
		description: 'Patient ID (MongoDB ObjectId) associated with this condition',
		example: '664b7f8e2c2a1e4b8f1d2c3a4',
		name: 'patientId',
	})
	@Expose({ name: 'patientId' })
	@IsString()
	@IsMongoId()
	patient: string;

	@ApiProperty({
		description: 'Name of the chronic condition',
		example: 'Diabetes Mellitus',
	})
	@IsString()
	@IsNotEmpty()
	@Length(2, 100)
	conditionName: string;

	@ApiProperty({
		description: 'Severity of the condition',
		example: 'moderate',
		enum: ['mild', 'moderate', 'severe'],
	})
	@IsString()
	@IsEnum(['mild', 'moderate', 'severe'])
	severity: string;

	@ApiProperty({
		description:
			'Indicates who made the diagnosis (doctor, pharmacist, AI, etc.)',
		enum: DiagnosedByEnum,
		example: DiagnosedByEnum.DOCTOR,
	})
	diagnosedBy: string;

	@ApiProperty({
		description: 'Date when the condition was diagnosed',
		type: DiagnosedDate,
	})
	@IsNotEmpty()
	diagnosedDate: DiagnosedDate;

	@ApiProperty({
		description: 'Current status of the condition',
		example: 'active',
		enum: ['active', 'managed', 'resolved', 'in_remission'],
	})
	@IsString()
	@IsEnum(['active', 'managed', 'resolved', 'in_remission'])
	currentStatus: string;

	@ApiProperty({
		description: 'Additional notes about the condition',
		example: 'Patient is responding well to treatment.',
		required: false,
	})
	@IsOptional()
	@IsString()
	@Length(0, 500)
	notes?: string;
}
