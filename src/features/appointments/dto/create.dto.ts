import { ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsMongoId, IsOptional, IsString } from 'class-validator';
import { AppointmentDto } from './appointment.dto';

export class CreateAppointmentDto extends PickType(AppointmentDto, [
	'title',
	'description',
	'appointmentDate',
] as const) {
	@ApiPropertyOptional({
		description:
			'Patient ID (MongoDB ObjectId) associated with this appointment',
		example: '664b7f8e2c2a1e4b8f1d2c3a4',
		name: 'patientId',
	})
	@IsOptional()
	@IsString()
	@IsMongoId()
	@Expose({ name: 'patientId' })
	patient?: string;

	@ApiPropertyOptional({
		description:
			'Personnel ID (MongoDB ObjectId) of the host for this appointment',
		example: '664b7f8e2c2a1e4b8f1d2c3a4',
		name: 'hostPersonnelId',
	})
	@IsOptional()
	@IsString()
	@IsMongoId()
	@Expose({ name: 'hostPersonnelId' })
	hostPersonnel?: string;
}

export class CreatePatientAppointmentDto extends PickType(AppointmentDto, [
	'title',
	'description',
	'appointmentDate',
] as const) {}
