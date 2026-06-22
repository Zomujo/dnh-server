import { ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationRequestDto } from '@/common/dto';
import { AppointmentDto } from './appointment.dto';

export enum AppointmentFilter {
	UPCOMING = 'upcoming',
	PAST = 'past',
}

export class GetAppointmentDto extends PickType(AppointmentDto, [
	'id',
	'title',
	'appointmentDate',
	'hostPersonnel',
]) {}

export class GetAppointmentsQueryDto extends PickType(PaginationRequestDto, [
	'page',
	'pageSize',
]) {
	@ApiPropertyOptional({
		description: 'Filter appointments by time relative to now',
		enum: AppointmentFilter,
		example: AppointmentFilter.UPCOMING,
	})
	@IsOptional()
	@IsEnum(AppointmentFilter)
	filter?: AppointmentFilter;
}
