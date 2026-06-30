import {
	ApiProperty,
	ApiPropertyOptional,
	ApiResponseProperty,
} from '@nestjs/swagger';
import {
	IsDateString,
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	Length,
} from 'class-validator';
import { GenericResponseDto } from '@/common/dto';
import { PersonnelDto } from '@/features/doctors/dto';
import { PatientDto } from '@/features/patients/dto';

export enum AppointmentStatus {
	SCHEDULED = 'scheduled',
	RESCHEDULED = 'rescheduled',
	ACTIVE = 'active',
	COMPLETED = 'completed',
	CANCELLED = 'cancelled',
}

export class AppointmentDto extends GenericResponseDto {
	@ApiProperty({
		description: 'Title of the appointment',
		example: 'Follow-up check',
	})
	@IsString()
	@IsNotEmpty()
	@Length(2, 100)
	title: string;

	@ApiPropertyOptional({
		description: 'Detailed description or notes about the appointment',
		example: 'Patient complained of mild headaches',
	})
	@IsString()
	@IsOptional()
	description?: string;

	@ApiPropertyOptional({
		description:
			'Reason for cancellation or rescheduling (populated based on status)',
		example: 'Patient requested a later time',
	})
	@IsString()
	@IsOptional()
	reason?: string;

	@ApiProperty({
		description: 'Date and time when the appointment is scheduled',
		example: '2026-06-22T10:00:00.000Z',
	})
	@IsDateString()
	appointmentDate: string;

	@ApiProperty({
		description: 'Current status of the appointment',
		enum: AppointmentStatus,
		example: AppointmentStatus.SCHEDULED,
	})
	@IsEnum(AppointmentStatus)
	@IsNotEmpty()
	status: AppointmentStatus;

	@ApiResponseProperty({
		type: () => PersonnelDto,
	})
	hostPersonnel: PersonnelDto;

	@ApiProperty({
		description: 'User ID associated with the appointment',
		example: 'user_12345',
	})
	@IsString()
	@IsNotEmpty()
	@Length(3, 50)
	userId: string;

	@ApiResponseProperty({
		type: () => PatientDto,
	})
	patient: PatientDto;

	@ApiPropertyOptional({
		description: 'Date and time when the appointment was rescheduled',
		example: '2026-06-23T14:00:00.000Z',
	})
	@IsDateString()
	@IsOptional()
	rescheduledAt?: string;

	@ApiResponseProperty({
		type: () => PersonnelDto,
	})
	rescheduledBy?: PersonnelDto;

	@ApiPropertyOptional({
		description: 'Date and time when the appointment was cancelled',
		example: '2026-06-22T09:00:00.000Z',
	})
	@IsDateString()
	@IsOptional()
	cancelledAt?: string;

	@ApiResponseProperty({
		type: () => PersonnelDto,
	})
	cancelledBy?: PersonnelDto;

	@ApiPropertyOptional({
		description: 'Date and time when the appointment was completed',
		example: '2026-06-22T10:30:00.000Z',
	})
	@IsDateString()
	@IsOptional()
	completedAt?: string;

	@ApiPropertyOptional({
		description: 'Number of times this appointment has been rescheduled',
		example: 0,
	})
	rescheduledCount?: number;
}
