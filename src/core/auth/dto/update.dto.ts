import { PartialType } from '@nestjs/swagger';

import { CreateAuthDto } from './create.dto';

export class UpdateAuthDto extends PartialType(CreateAuthDto) {}
