import { PartialType } from '@nestjs/swagger';
import { CreatePatientDto } from './create.dto';

export class UpdatePatientDto extends PartialType(CreatePatientDto) {}
