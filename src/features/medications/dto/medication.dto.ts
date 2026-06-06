import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
	IsArray,
	IsDateString,
	IsMongoId,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	Length,
} from 'class-validator';

export class MedicationDto {
	@ApiProperty({
		description: 'User ID associated with the medication',
		example: 'user_12345',
	})
	@IsString()
	@IsNotEmpty()
	@Length(3, 50)
	userId: string;

	@ApiProperty({
		description:
			'Patient ID (MongoDB ObjectId) associated with this medication',
		example: '664b7f8e2c2a1e4b8f1d2c3a4',
		name: 'patientId',
	})
	@Expose({ name: 'patientId' })
	@IsString()
	@IsMongoId()
	patient: string;

	@ApiProperty({
		description: 'Name of the medication',
		example: 'Metformin',
	})
	@IsString()
	@IsNotEmpty()
	@Length(2, 100)
	name: string;

	@ApiProperty({
		description: 'Quantity prescribed',
		example: 30,
	})
	@IsNumber()
	quantity: number;

	@ApiProperty({
		description: 'At what quantity should a refill reminder be sent',
		example: 3,
	})
	@IsNumber()
	refillReminder: number;

	@ApiProperty({
		description: 'Unit of quantity (e.g., tablets, ml, capsules)',
		example: 'tablets',
	})
	@IsString()
	@IsNotEmpty()
	@Length(2, 20)
	quantityUnit: string;

	@ApiProperty({
		description: 'Dosage information (e.g., 500mg)',
		example: '500mg',
	})
	@IsString()
	@IsNotEmpty()
	@Length(1, 50)
	dosage: string;

	@ApiProperty({
		description: 'Frequency of administration (e.g., twice daily)',
		example: 'twice daily',
	})
	@IsString()
	@IsNotEmpty()
	@Length(2, 50)
	frequency: string;

	@ApiProperty({
		description: 'Route of administration (e.g., oral, injection)',
		example: 'oral',
	})
	@IsString()
	@IsNotEmpty()
	@Length(2, 30)
	route: string;

	@ApiProperty({
		description: 'Start date of medication',
		example: '2024-06-01',
		format: 'date',
	})
	@IsDateString()
	startDate: string;

	@ApiPropertyOptional({
		description: 'End date of medication',
		example: '2024-07-01',
		format: 'date',
	})
	@IsOptional()
	@IsDateString()
	endDate?: string;

	@ApiProperty({
		description: 'Prescriber name',
		example: 'Dr. Smith',
	})
	@IsString()
	@IsNotEmpty()
	@Length(2, 100)
	prescribedBy: string;

	@ApiProperty({
		description: 'Purpose of the medication',
		example: 'Blood pressure control',
	})
	@IsString()
	@IsNotEmpty()
	@Length(2, 100)
	purpose: string;

	@ApiPropertyOptional({
		description: 'Possible side effects',
		example: ['Nausea', 'Headache'],
		type: [String],
	})
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	sideEffects?: string[];
}
