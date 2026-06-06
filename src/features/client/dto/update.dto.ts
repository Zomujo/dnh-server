import { PartialType } from '@nestjs/swagger';

import { CreateChronicCareDto } from './create.dto';

export class UpdateChronicCareDto extends PartialType(CreateChronicCareDto) {}
