import { PickType } from '@nestjs/swagger';
import { AppointmentRequestDto } from './appointment-request.dto';

export class CreateAppointmentRequestDto extends PickType(
	AppointmentRequestDto,
	['description', 'type', 'preferredDate'],
) {}
