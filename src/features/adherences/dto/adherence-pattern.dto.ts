import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
	IsDateString,
	IsEnum,
	IsMongoId,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	Length,
	Max,
	Min,
} from 'class-validator';

export class AdherencePatternDto {
	@ApiProperty({
		description: 'User ID associated with the adherence pattern',
		example: 'user_12345',
	})
	@IsString()
	@IsNotEmpty()
	@Length(3, 50)
	userId: string;

	@ApiProperty({
		description: 'Patient ID (MongoDB ObjectId) associated with this pattern',
		example: '64b7f8e2c2a1e4b8f1d2c3a4',
		name: 'patientId',
	})
	@Expose({ name: 'patientId' })
	@IsString()
	@IsNotEmpty()
	@IsMongoId()
	patient: string;

	@ApiProperty({
		description: 'Type of target (medication, lifestyle, therapy)',
		example: 'medication',
		enum: ['medication', 'lifestyle', 'therapy'],
	})
	@IsString()
	@IsEnum(['medication', 'lifestyle', 'therapy'])
	targetType: string;

	@ApiProperty({
		description: 'Name of the target (e.g., medication name, lifestyle habit)',
		example: 'Metformin',
	})
	@IsString()
	@IsNotEmpty()
	@Length(2, 100)
	targetName: string;

	@ApiProperty({
		description: 'Adherence rate as a percentage (0–100)',
		example: 85,
		minimum: 0,
		maximum: 100,
	})
	@IsNumber()
	@Min(0)
	@Max(100)
	adherenceRate: number;

	@ApiProperty({
		description: 'Date and time when adherence was last logged',
		example: '2024-06-01T10:30:00.000Z',
		type: String,
		format: 'date-time',
	})
	@IsString()
	@IsDateString()
	lastLoggedAt: string;

	@ApiProperty({
		description: 'Additional notes about the adherence pattern',
		example: 'Patient missed dose on Monday due to travel.',
		required: false,
	})
	@IsOptional()
	@IsString()
	@Length(0, 500)
	notes?: string;
}
