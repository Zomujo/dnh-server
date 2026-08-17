import { PartialType } from '@nestjs/swagger';
import { CreateAdherenceDto } from './create.dto';

export class UpdateAdherenceDto extends PartialType(CreateAdherenceDto) {}
