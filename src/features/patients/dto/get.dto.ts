import {
	ApiResponseProperty,
	IntersectionType,
	PickType,
} from '@nestjs/swagger';
import { GenericResponseDto, PaginationRequestDto } from '@/common/dto';
import { PatientDto } from './patient.dto';

export class GetPatientDto extends IntersectionType(
	PickType(PatientDto, [
		'userId',
		'patientCode',
		'age',
		'name',
		'dateOfBirth',
		'height',
		'gender',
	]),
	GenericResponseDto,
) {
	@ApiResponseProperty({
		example: 35,
	})
	weight: number;

	@ApiResponseProperty({
		example: 21.6,
	})
	bmi: number;
}

export class GetPatientNoPaginateDto extends IntersectionType(
	PickType(PatientDto, ['userId', 'patientCode', 'name']),
	PickType(GenericResponseDto, ['id']),
) {}

export class FilterPatientsDto extends PaginationRequestDto {
	personnelId: string;
}

export class FilterPatientsNoPaginateDto extends PickType(
	PaginationRequestDto,
	['search', 'searchFields'],
) {}
