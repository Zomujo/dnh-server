import { PickType } from '@nestjs/swagger';
import { PaginationRequestDto } from '@/common/dto';
import { AppointmentRequestDto } from './appointment-request.dto';

export class GetAppointmentRequestDto extends AppointmentRequestDto {}

export class GetAppointmentRequestsQueryDto extends PickType(
	PaginationRequestDto,
	['page', 'pageSize'],
) {}
