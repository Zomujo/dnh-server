import {
	ApiProperty,
	ApiPropertyOptional,
	ApiResponseProperty,
} from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
	IsArray,
	IsDateString,
	IsEnum,
	IsMongoId,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	Length,
	ValidateNested,
} from 'class-validator';
import { Frequency } from '@/features/notifications/dto/notification.dto';

export class TimeDesignatorDto {
	@ApiProperty({ description: 'Hour (0-23)', example: 8 })
	@IsNumber()
	hour: number;

	@ApiProperty({ description: 'Minutes (0-59)', example: 30 })
	@IsNumber()
	minutes: number;

	@ApiProperty({
		description: 'Time designator',
		enum: ['AM', 'PM'],
		example: 'AM',
	})
	@IsEnum(['AM', 'PM'])
	timeDesignators: 'AM' | 'PM';
}

class DosingQuantityDto {
	@ApiProperty({ description: 'Quantity value', example: 1 })
	@IsNumber()
	value: number;

	@ApiProperty({ description: 'Quantity unit', example: 'tablet' })
	@IsString()
	@IsNotEmpty()
	unit: string;
}

export class DosingSchedule {
	@ApiProperty({ description: 'Time of day', type: TimeDesignatorDto })
	@ValidateNested()
	@Type(() => TimeDesignatorDto)
	@IsNotEmpty()
	time: TimeDesignatorDto;

	@ApiProperty({ description: 'Dosage quantity', type: DosingQuantityDto })
	@ValidateNested()
	@Type(() => DosingQuantityDto)
	@IsNotEmpty()
	quantity: DosingQuantityDto;

	// Server-managed reminder id; not accepted from the request.
	@ApiResponseProperty({ example: '678fa53f3a0ba70822aa3555' })
	declare notification?: string;
}

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
		description: 'Settings for medication frequency',
		type: Frequency,
	})
	@ValidateNested()
	@Type(() => Frequency)
	@IsNotEmpty()
	frequency: Frequency;

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

	@ApiPropertyOptional({
		description: 'Notes about the medication',
		example: 'Take with food',
	})
	@IsString()
	@IsOptional()
	notes?: string;

	@ApiPropertyOptional({
		description: 'Morning dosing schedule. On update, null removes it.',
		nullable: true,
		type: DosingSchedule,
	})
	@IsOptional()
	@ValidateNested()
	@Type(() => DosingSchedule)
	morning?: DosingSchedule;

	@ApiPropertyOptional({
		description: 'Afternoon dosing schedule. On update, null removes it.',
		nullable: true,
		type: DosingSchedule,
	})
	@IsOptional()
	@ValidateNested()
	@Type(() => DosingSchedule)
	afternoon?: DosingSchedule;

	@ApiPropertyOptional({
		description: 'Evening dosing schedule. On update, null removes it.',
		nullable: true,
		type: DosingSchedule,
	})
	@IsOptional()
	@ValidateNested()
	@Type(() => DosingSchedule)
	evening?: DosingSchedule;
}
