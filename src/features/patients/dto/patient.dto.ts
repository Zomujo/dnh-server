export class PatientPayload {
	userId: string;
	patientId: string;
	name: string;
	phoneNumber: string;
	chronicConditions?: string[];
}

import {
	ApiProperty,
	ApiPropertyOptional,
	ApiResponseProperty,
} from '@nestjs/swagger';
import {
	IsArray,
	IsDateString,
	IsEnum,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsPhoneNumber,
	IsString,
	MaxLength,
	Min,
} from 'class-validator';
import { GenderEnum } from '../entities/patient.entity';

export enum AdherenceStatus {
	CRITICAL = 'critical',
	SILENT = 'silent',
	STABLE = 'stable',
}

export class PatientDto {
	@ApiResponseProperty({
		example: 'ZC-JJ86234',
	})
	patientCode?: string;

	@ApiProperty({
		description: 'The ID of the user associated with the patient',
		example: '64b1f2a7a2b3c9d5f8e2a111',
	})
	@IsString()
	@IsNotEmpty()
	userId: string;

	@ApiProperty({
		description: 'Ghana card number of the patient',
		example: 'GHA-123456789-0',
	})
	@IsString()
	@IsNotEmpty()
	ghanaCardNumber: string;

	@ApiPropertyOptional({
		description: 'NHIS number of the patient',
		example: 'NHIS-123456789',
	})
	@IsString()
	@IsOptional()
	nhisNumber?: string;

	@ApiProperty({
		description: 'First name of the patient',
		example: 'John',
	})
	@IsString()
	@IsNotEmpty()
	name: string;

	@ApiProperty({
		description: 'The phone number of the patient in E.164 format',
		example: '+2335544123',
	})
	@IsString()
	@IsNotEmpty()
	phoneNumber: string;

	@ApiProperty({
		description: 'Year Of Birth of the patient',
		example: 1963,
	})
	@IsNumber()
	@Min(1900)
	yearOfBirth: number;

	@ApiProperty({
		description: 'Date of birth of the patient in MM/DD/YYYY format',
		example: '01/01/1963',
	})
	@IsDateString()
	@IsNotEmpty()
	dateOfBirth: Date;

	@ApiResponseProperty({
		example: 35,
	})
	age: number;

	@ApiProperty({
		description: 'Gender of the patient',
		enum: ['male', 'female', 'other'],
		example: 'male',
	})
	@IsEnum(['male', 'female', 'other'])
	gender: GenderEnum;

	@ApiPropertyOptional({
		description: 'Height of the patient in centimeters',
		example: 175,
	})
	@IsOptional()
	@IsNumber()
	@Min(30)
	height?: number;

	@ApiPropertyOptional({
		description: 'Blood type of the patient',
		example: 'O+',
	})
	@IsOptional()
	@IsString()
	bloodType?: string;

	@ApiPropertyOptional({
		description: 'List of allergies',
		example: ['peanuts', 'penicillin'],
	})
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	allergies?: string[];

	@ApiPropertyOptional({
		description: 'Primary physician name',
		example: 'Dr. Smith',
	})
	@IsOptional()
	@IsString()
	primaryPhysician?: string;

	@ApiPropertyOptional({
		description: 'Emergency contact full name',
		example: 'Jane Doe',
	})
	@IsOptional()
	@IsString()
	emergencyContactName?: string;

	@ApiPropertyOptional({
		description: 'Emergency contact phone number',
		example: '+233541234567',
	})
	@IsOptional()
	@IsPhoneNumber()
	emergencyContactPhone?: string;

	@ApiPropertyOptional({
		description: 'Smoking status of the patient',
		enum: ['current', 'former', 'never'],
		example: 'never',
	})
	@IsOptional()
	@IsEnum(['current', 'former', 'never'])
	smokingStatus?: string;

	@ApiPropertyOptional({
		description: 'Alcohol use status of the patient',
		enum: ['yes', 'no', 'occasional'],
		example: 'occasional',
	})
	@IsOptional()
	@IsEnum(['yes', 'no', 'occasional'])
	alcoholUse?: string;

	@ApiPropertyOptional({
		description: 'Pregnancy status of the patient',
		enum: ['pregnant', 'not_pregnant', 'unknown'],
		example: 'unknown',
	})
	@IsOptional()
	@IsEnum(['pregnant', 'not_pregnant', 'unknown'])
	pregnancyStatus?: string;

	@ApiPropertyOptional({
		description: 'Additional notes about the patient',
		example: 'Patient has a history of hypertension.',
	})
	@IsOptional()
	@IsString()
	@MaxLength(500)
	notes?: string;

	@ApiPropertyOptional({
		description: 'Timezone of the patient',
		example: 'GMT',
	})
	@IsString()
	@IsOptional()
	timezone?: string;

	@ApiPropertyOptional({
		description: 'Chronic condition names the patient has been diagnosed with',
		example: ['hypertension'],
	})
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	chronicConditions?: string[];

	@ApiPropertyOptional({
		description: 'Date of the last adherence check-in',
		example: new Date(),
	})
	@IsOptional()
	lastCheckInDate?: Date;

	@ApiPropertyOptional({
		description: 'Overall adherence rate (0-100)',
		example: 85.5,
	})
	@IsOptional()
	@IsNumber()
	adherenceRate?: number;

	@ApiPropertyOptional({
		description: 'Adherence status',
		enum: AdherenceStatus,
		example: 'stable',
	})
	@IsOptional()
	@IsEnum(AdherenceStatus)
	adherenceStatus?: AdherenceStatus;
}
