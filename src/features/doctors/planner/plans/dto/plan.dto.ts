import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
	IsDateString,
	IsEnum,
	IsMongoId,
	IsNotEmpty,
	IsString,
} from 'class-validator';

export enum PlanStatus {
	DRAFT = 'draft',
	UPLOADED = 'uploaded',
	COMPLETED = 'completed',
	REJECTED = 'rejected',
	DISCARDED = 'discarded',
}
export class PlanDto {
	@ApiProperty({
		description: 'Personnel ID (MongoDB ObjectId) who created this plan',
		example: '664b7f8e2c2a1e4b8f1d2c3a4',
		name: 'personnelId',
	})
	@Expose({ name: 'personnelId' })
	@IsString()
	@IsMongoId()
	personnel: string;

	@ApiProperty({
		description: 'Patient ID (MongoDB ObjectId) associated with this plan',
		example: '664b7f8e2c2a1e4b8f1d2c3a4',
		name: 'patientId',
	})
	@Expose({ name: 'patientId' })
	@IsString()
	@IsMongoId()
	patient: string;

	@ApiProperty({
		description: 'Planner Session ID (MongoDB ObjectId) this plan belongs to',
		example: '664b7f8e2c2a1e4b8f1d2c3a4',
		name: 'plannerSessionId',
	})
	@Expose({ name: 'plannerSessionId' })
	@IsString()
	@IsMongoId()
	plannerSession: string;

	@ApiProperty({
		description: 'Primary objective of the chronic care treatment plan',
		example: 'Control HbA1c levels through diet and medication',
	})
	@IsString()
	@IsNotEmpty()
	treatmentGoal: string;

	@ApiProperty({
		description:
			'List of medications prescribed or recommended for the patient',
		example: 'Metformin 500mg twice daily after meals',
	})
	@IsString()
	@IsNotEmpty()
	medications: string;

	@ApiProperty({
		description:
			'Dietary, exercise, or habit changes recommended for the patient',
		example: 'Reduce refined sugars, 30-minute brisk walk daily',
	})
	@IsString()
	@IsNotEmpty()
	lifestyleAdvice: string;

	@ApiProperty({
		description: 'Supplementary treatments or therapies for the patient',
		example: 'Foot care counseling',
	})
	@IsString()
	@IsNotEmpty()
	otherTherapies: string;

	@ApiProperty({
		description: 'Required follow-up measurements or checks for the patient',
		example: 'Daily blood sugar checks, HbA1c every 3 months',
	})
	@IsString()
	@IsNotEmpty()
	monitoring: string;

	@ApiProperty({
		description: 'Date and time of the next scheduled appointment',
		example: '2024-07-01T09:00:00Z',
		format: 'date-time',
	})
	@IsDateString()
	nextAppointmentAt: string;

	@ApiProperty({
		description: 'The state of the plan. Default is draft',
		example: 'draft',
		enum: PlanStatus,
	})
	@IsEnum(PlanStatus)
	status: PlanStatus;
}
