import { PartialType } from '@nestjs/swagger';
import { CreateAppointmentRequestDto } from './create.dto';

export class UpdateAppointmentRequestDto extends PartialType(
	CreateAppointmentRequestDto,
) {}
