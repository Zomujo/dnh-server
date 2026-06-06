import { PartialType } from '@nestjs/swagger';
import { CreateConcernDto } from './create.dto';

export class UpdateConcernDto extends PartialType(CreateConcernDto) {}
