import { PartialType } from '@nestjs/swagger';
import { CreatePlannerSessionDto } from './create.dto';

export class UpdatePlannerSessionDto extends PartialType(
	CreatePlannerSessionDto,
) {}
