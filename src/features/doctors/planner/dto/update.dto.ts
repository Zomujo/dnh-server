import { PartialType } from '@nestjs/swagger';
import { CreatePlannerDto } from './create.dto';

export class UpdatePlannerDto extends PartialType(CreatePlannerDto) {}
