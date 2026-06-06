import { PartialType } from '@nestjs/swagger';
import { CreateNotificationDto } from './create.dto';

export class UpdateNotificationDto extends PartialType(CreateNotificationDto) {}
