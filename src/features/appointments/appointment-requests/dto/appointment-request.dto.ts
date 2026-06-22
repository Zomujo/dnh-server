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
} from 'class-validator';
import { GenericResponseDto } from '@/common/dto';
import { FacilityDto } from '@/features/facilities/dto';
import { PatientDto } from '@/features/patients/dto';

export enum AppointmentRequestType {
	SCHEDULE = 'SCHEDULE',
	RESCHEDULE = 'RESCHEDULE',
	CANCEL = 'CANCEL',
}

export enum AppointmentRequestStatus {
	PENDING = 'PENDING',
	APPROVED = 'APPROVED',
	REJECTED = 'REJECTED',
}

export class AppointmentRequestDto extends GenericResponseDto {
	@ApiProperty({
		description: 'Type of appointment request',
		enum: AppointmentRequestType,
		example: AppointmentRequestType.SCHEDULE,
	})
	@IsEnum(AppointmentRequestType)
	@IsNotEmpty()
	type: AppointmentRequestType;

	@ApiResponseProperty({
		type: () => PatientDto,
	})
	patient: PatientDto;

	@ApiResponseProperty({
		type: () => FacilityDto,
	})
	host: FacilityDto;

	@ApiPropertyOptional({
		description: 'Details about the appointment request',
		example: 'Patient needs a follow-up for hypertension check',
	})
	@IsString()
	@IsOptional()
	description?: string;

	@ApiPropertyOptional({
		description: 'Preferred date and time for the appointment',
		example: '2026-07-01T10:00:00.000Z',
	})
	@IsDateString()
	@IsOptional()
	preferredDate?: string;

	@ApiProperty({
		description: 'Current status of the request',
		enum: AppointmentRequestStatus,
		example: AppointmentRequestStatus.PENDING,
	})
	@IsEnum(AppointmentRequestStatus)
	@IsNotEmpty()
	status: AppointmentRequestStatus;
}
