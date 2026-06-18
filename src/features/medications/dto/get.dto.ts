import { IntersectionType, PickType } from '@nestjs/swagger';
import { GenericResponseDto } from '@/common/dto';
import { MedicationDto } from './medication.dto';

export class GetMedicationDto extends IntersectionType(
	PickType(MedicationDto, [
		'name',
		'quantity',
		'quantityUnit',
		'refillReminder',
		'dosage',
		'frequency',
		'prescribedBy',
	]),
	PickType(GenericResponseDto, ['id']),
) {}
