import { PartialType } from '@nestjs/swagger';
import { CreateDhVectorDto } from './create.dto';

export class UpdateDhVectorDto extends PartialType(CreateDhVectorDto) {}
