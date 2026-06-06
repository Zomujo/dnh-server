import { PartialType } from '@nestjs/swagger';
import { CreateChronicConditionDto } from './create.dto';

export class UpdateChronicConditionDto extends PartialType(
	CreateChronicConditionDto,
) {}
