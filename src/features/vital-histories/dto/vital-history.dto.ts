import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
	IsEnum,
	IsMongoId,
	IsNotEmpty,
	IsOptional,
	IsString,
	Length,
} from 'class-validator';

export enum VitalTypes {
	BLOOD_PRESSURE = 'bloodPressure',
	HEART_RATE = 'heartRate',
	TEMPERATURE = 'temperature',
	RESPIRATION_RATE = 'respirationRate',
	OXYGEN_SATURATION = 'oxygenSaturation',
	WEIGHT = 'weight',
	BLOOD_SUGAR = 'bloodSugar',
}

export interface VitalHistoryBody {
	totalCount: number;
	totalSystolic?: number;
	totalDiastolic?: number;
	totalValue?: number;
	startDate: Date;
	endDate: Date;
	normalCount?: number;
	elevatedCount?: number;
	criticalCount?: number;
}

export class VitalHistoryDto {
	@ApiProperty({
		description: 'User ID associated with the vital history record',
		example: 'user_12345',
	})
	@IsString()
	@IsNotEmpty()
	@Length(3, 50)
	userId: string;

	@ApiProperty({
		description: 'Patient ID (MongoDB ObjectId) associated with this record',
		example: '664b7f8e2c2a1e4b8f1d2c3a4',
		name: 'patientId',
	})
	@Expose({ name: 'patientId' })
	@IsString()
	@IsMongoId()
	patient: string;

	@ApiProperty({
		description: 'Type of vital sign',
		example: 'bloodPressure',
		enum: VitalTypes,
	})
	@IsString()
	@IsEnum(VitalTypes)
	vitalType: VitalTypes;

	@ApiProperty({
		description: 'Type of vital sign',
		example: 'bloodPressure',
		enum: ['randomBloodSugar', 'fastingBloodSugar', 'oralGlucoseTt'],
	})
	@IsString()
	@IsEnum(['randomBloodSugar', 'fastingBloodSugar', 'oralGlucoseTt'])
	vitalSubType: string;

	@ApiProperty({
		description: 'Measured value of the vital sign',
		example: '120/80',
	})
	@IsString()
	@IsNotEmpty()
	@Length(1, 50)
	value: string;

	@ApiProperty({
		description: 'Unit of measurement',
		example: 'mmHg',
	})
	@IsString()
	@IsNotEmpty()
	@Length(1, 20)
	unit: string;

	@ApiPropertyOptional({
		description: 'Severity of the vital sign (if applicable)',
		example: 'normal',
		enum: ['normal', 'elevated', 'critical'],
	})
	@IsOptional()
	@IsString()
	@IsEnum(['normal', 'elevated', 'critical'])
	severity?: string;

	@ApiPropertyOptional({
		description: 'Reasoning or interpretation for the vital sign',
		example: 'Within normal range',
	})
	@IsOptional()
	@IsString()
	@Length(1, 200)
	reasoning?: string;

	@ApiProperty({
		description: 'Date and time when the vital was recorded',
		example: new Date(),
		format: 'date-time',
	})
	@IsNotEmpty()
	@Type(() => Date)
	recordedAt: Date;

	@ApiPropertyOptional({
		description: 'Additional notes about the vital sign',
		example: 'Patient was resting during measurement.',
	})
	@IsOptional()
	@IsString()
	@Length(0, 500)
	notes?: string;
}
