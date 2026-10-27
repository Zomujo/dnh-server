import { PartialType, PickType } from '@nestjs/swagger';
import { UpdatePatientDto } from '@/features/patients/dto/update.dto';

import { CreateChronicCareDto } from './create.dto';

export class UpdateChronicCareDto extends PartialType(CreateChronicCareDto) {}

/** The profile fields a patient edits in the app. */
export class UpdateProfileDto extends PickType(UpdatePatientDto, [
	'firstname',
	'lastname',
	'gender',
]) {}
