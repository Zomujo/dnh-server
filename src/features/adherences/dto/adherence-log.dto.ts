import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
	IsBoolean,
	IsEnum,
	IsMongoId,
	IsNotEmpty,
	IsOptional,
	IsString,
} from 'class-validator';

export enum TargetType {
	MEDICATION = 'medication',
	EXERCISE = 'exercise',
	DIET = 'diet',
	VITALS = 'vitals',
	APPOINTMENT = 'appointment',
	OTHER = 'other',
}

export enum Status {
	TAKEN = 'taken',
	MISSED = 'missed',
	PARTIAL = 'partial',
}

export class AdherenceLogDto {
	@ApiProperty({
		example: 'user_123',
		description: 'ID of the user logging adherence',
	})
	@IsString()
	userId: string;

	@ApiProperty({
		example: '60d21b4667d0d8992e610c85',
		description: 'Patient ObjectId',
		name: 'patientId',
	})
	@Expose({ name: 'patientId' })
	@IsString()
	@IsMongoId()
	patient: string;

	@ApiProperty({
		example: TargetType.MEDICATION,
		enum: TargetType,
		description: 'Type of adherence target',
	})
	@IsEnum(TargetType)
	targetType: TargetType;

	@ApiProperty({
		example: 'Metformin',
		description: 'Name of the adherence target (e.g., medication name)',
	})
	@IsString()
	targetName: string;

	@ApiProperty({
		example: true,
		description: 'Whether the target was taken/adhered to',
	})
	@IsBoolean()
	taken: boolean;

	@ApiProperty({
		example: new Date(),
		description: 'Date and time when target was taken',
	})
	@IsNotEmpty()
	@Type(() => Date)
	takenAt: Date;

	@ApiProperty({
		example: Status.TAKEN,
		enum: Status,
		description: 'Status of adherence',
	})
	@IsEnum(Status)
	status: Status;

	@ApiProperty({
		example: 'Patient felt dizzy after medication',
		description: 'Additional notes',
		required: false,
	})
	@IsOptional()
	@IsString()
	notes?: string;
}
