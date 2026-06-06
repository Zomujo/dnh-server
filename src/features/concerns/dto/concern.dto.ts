import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
	ArrayNotEmpty,
	IsArray,
	IsBoolean,
	IsDateString,
	IsEnum,
	IsMongoId,
	IsNotEmpty,
	IsOptional,
	IsString,
	Length,
} from 'class-validator';

export enum ConcernTypes {
	Symptom = 'symptom',
	SideEffect = 'sideEffect',
	MentalHealth = 'mentalHealth',
	General = 'general',
	Other = 'other',
}

export class ConcernDto {
	@ApiProperty({
		description: 'User ID who raised the concern',
		example: 'user_12345',
	})
	@IsString()
	@IsNotEmpty()
	@Length(3, 50)
	userId: string;

	@ApiProperty({
		description: 'Patient ID (MongoDB ObjectId) associated with this concern',
		example: '664b7f8e2c2a1e4b8f1d2c3a4',
		name: 'patientId',
	})
	@Expose({ name: 'patientId' })
	@IsString()
	@IsMongoId()
	patient: string;

	@ApiProperty({
		description: 'Type of concern',
		example: 'symptom',
		enum: ConcernTypes,
	})
	@IsString()
	@IsEnum(ConcernTypes)
	concernType: string;

	@ApiProperty({
		description: 'Descriptions of the concern',
		example: ['Headache', 'Nausea'],
		type: [String],
	})
	@IsArray()
	@ArrayNotEmpty()
	@IsString({ each: true })
	description: string[];

	@ApiProperty({
		description: 'Severity of the concern',
		example: 'moderate',
		enum: ['mild', 'moderate', 'severe'],
	})
	@IsString()
	@IsEnum(['mild', 'moderate', 'severe'])
	severity: string;

	@ApiProperty({
		description: 'Date when the concern started',
		example: new Date(),
		format: 'date',
	})
	@IsDateString()
	onsetDate: string;

	@ApiProperty({
		description: 'Whether the concern has been resolved',
		example: false,
		default: false,
	})
	@IsBoolean()
	resolved: boolean;

	@ApiProperty({
		description: 'Additional notes about the concern',
		example: 'Patient reported improvement after medication.',
		required: false,
	})
	@IsOptional()
	@IsString()
	@Length(0, 500)
	notes?: string;
}
