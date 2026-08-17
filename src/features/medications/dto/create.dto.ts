import { PickType } from '@nestjs/swagger';
import { MedicationDto } from './medication.dto';

export class CreateMedicationDto extends PickType(MedicationDto, [
	'name',
	'dosage',
	'notes',
	'morning',
	'afternoon',
	'evening',
]) {}

export class UpsertMedicationDto {}
