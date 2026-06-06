import { OmitType, PartialType } from '@nestjs/swagger';
import { CreatePlanDto } from './create.dto';

export class UpdatePlanDto extends PartialType(
	OmitType(CreatePlanDto, ['personnel', 'patient', 'plannerSession']),
) {
	patient: string;
}
