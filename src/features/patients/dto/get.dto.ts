import {
	ApiPropertyOptional,
	ApiResponseProperty,
	IntersectionType,
	OmitType,
	PickType,
} from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';
import { GenericResponseDto, PaginationRequestDto } from '@/common/dto';
import { AdherenceStatus, PatientDto } from './patient.dto';

export enum FilterBy {
	HYPERTENSION = 'hypertension',
	DIABETES = 'diabetes',
	BOTH = 'both',
	CRITICAL = 'critical',
	SILENT = 'silent',
	STABLE = 'stable',
}

export class GetPatientDto extends IntersectionType(
	PickType(PatientDto, [
		'userId',
		'patientCode',
		'age',
		'name',
		'yearOfBirth',
		'height',
		'gender',
		'facility',
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

export class GetPersonnelPatientDto extends IntersectionType(
	OmitType(PatientDto, [
		'yearOfBirth',
		'height',
		'phoneNumber',
		'bloodType',
		'allergies',
		'primaryPhysician',
		'emergencyContactName',
		'emergencyContactPhone',
		'smokingStatus',
		'alcoholUse',
		'pregnancyStatus',
		'notes',
		'timezone',
	]),
	GenericResponseDto,
) {
	@ApiResponseProperty({
		example: 3,
	})
	criticalReadingsCount: number;

	@ApiResponseProperty({
		example: false,
	})
	assignedToYou: boolean;
}

export class GetPersonnelPatientsDto extends PickType(GenericResponseDto, [
	'id',
]) {
	@ApiResponseProperty({
		example: 'John Doe',
	})
	name: string;

	@ApiResponseProperty({
		example: 35,
	})
	age: number;

	@ApiResponseProperty({
		example: 'hypertension',
	})
	chronicConditions: string[];

	@ApiResponseProperty({
		example: '2026-06-29T10:30:00.000Z',
	})
	lastCheckInDate: Date;

	@ApiResponseProperty({
		example: 85.5,
	})
	adherenceRate: number;

	@ApiResponseProperty({
		example: AdherenceStatus.STABLE,
	})
	adherenceStatus: AdherenceStatus;
}

export class GetPatientNoPaginateDto extends IntersectionType(
	PickType(PatientDto, ['userId', 'patientCode', 'name']),
	PickType(GenericResponseDto, ['id']),
) {}

export class FilterPatientsDto extends PaginationRequestDto {
	@ApiPropertyOptional({
		description: 'Filter patients by the personnel who has visited them',
		example: '664b7f8e2c2a1e4b8f1d2c3a',
	})
	@IsOptional()
	@IsString()
	@IsMongoId()
	personnelId?: string;

	@ApiPropertyOptional({
		description: 'Filter patients by condition or adherence status',
		enum: FilterBy,
		example: FilterBy.HYPERTENSION,
	})
	@IsOptional()
	@IsEnum(FilterBy)
	filterBy?: FilterBy;

	@ApiPropertyOptional({
		name: 'facilityId',
		example: '664b7f8e2c2a1e4b8f1d2c3a',
	})
	@IsOptional()
	@IsString()
	@IsMongoId()
	@Expose({ name: 'facilityId' })
	facility?: string;
}

export class FilterPatientsNoPaginateDto extends PickType(
	PaginationRequestDto,
	['search', 'searchFields'],
) {
	@ApiPropertyOptional({
		description:
			'Exact patient code. For pharmacies this is the only way to find a ' +
			'patient outside their own registered/visited list.',
		example: '3F9A1C7B',
	})
	@IsOptional()
	@IsString()
	patientCode?: string;

	@ApiPropertyOptional({
		name: 'facilityId',
		example: '664b7f8e2c2a1e4b8f1d2c3a',
	})
	@IsOptional()
	@IsString()
	@IsMongoId()
	@Expose({ name: 'facilityId' })
	facility?: string;
}
