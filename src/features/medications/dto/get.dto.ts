import {
	ApiResponseProperty,
	IntersectionType,
	PickType,
} from '@nestjs/swagger';
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
) {
	@ApiResponseProperty({
		example: new Date(),
		format: 'date',
	})
	lastTaken: Date;

	@ApiResponseProperty({
		example: [
			{
				id: '68e3ca3c2383b37fe4cb88a8',
				takenAt: new Date(),
				taken: false,
			},
		],
	})
	adherenceLogs: { id: string; taken: boolean }[];
}
