import { PartialType } from '@nestjs/swagger';
import { CreateAppointmentDto } from './create.dto';

export class UpdateAppointmentDto extends PartialType(CreateAppointmentDto) {}
