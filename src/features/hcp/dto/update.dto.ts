import { PartialType } from '@nestjs/swagger';
import { CreateHcpDto } from './create.dto';

export class UpdateHcpDto extends PartialType(CreateHcpDto) {}
