import {
	ApiProperty,
	ApiResponseProperty,
	IntersectionType,
	PickType,
} from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { GenericResponseDto, PaginationRequestDto } from '@/common/dto';
import { PatientDto } from '../../patients/dto';
import { CreateVitalHistoryDto, DateRange, VitalType } from './create.dto';
import { VitalHistoryDto } from './vital-history.dto';

export class GetVitalHistoryDto extends IntersectionType(
	PickType(VitalHistoryDto, ['vitalType', 'value', 'severity', 'unit']),
	PickType(GenericResponseDto, ['id']),
) {
	@ApiResponseProperty({
		example: 'Blood Pressure',
		enum: [
			'Blood Pressure',
			'Heart Rate',
			'Temperature',
			'Respiration Rate',
			'Oxygen Saturation',
			'Weight',
			'Blood Sugar',
		],
	})
	vitalName: string;
}

export class GetVitalHistoriesPersonnelDto extends IntersectionType(
	PickType(GenericResponseDto, ['id']),
	PickType(VitalHistoryDto, ['recordedAt']),
) {
	@ApiResponseProperty({
		example: '664b7f8e2c2a1e4b8f1d2c3a4',
	})
	patientId: string;

	@ApiResponseProperty({
		example: {
			patientCode: 'ZC-JD09234',
			name: 'John Doe',
			id: '664b7f8e2c2a1e4b8f1d2c3a4',
		},
	})
	patient: PatientDto;
}

export class GetVitalHistoryPersonnelDto extends IntersectionType(
	PickType(GenericResponseDto, ['id']),
	CreateVitalHistoryDto,
) {}

export class VitalHistoryTrendsQueryDto {
	@ApiProperty({
		enum: ['heartRate', 'bloodSugar'],
	})
	@IsEnum(VitalType)
	vitalType: string;

	@ApiProperty({
		enum: DateRange,
	})
	@IsEnum(DateRange)
	dateRange: DateRange;
}

export class BpTrendsQueryDto extends PickType(VitalHistoryTrendsQueryDto, [
	'dateRange',
]) {}

export class VitalHistoryTrendsResponseDto {
	@ApiResponseProperty()
	labels: string[];

	@ApiResponseProperty({
		example: [10],
	})
	values: number[];
}

export class BpTrendsResponseDto extends PickType(
	VitalHistoryTrendsResponseDto,
	['labels'],
) {
	@ApiResponseProperty({
		example: [130],
	})
	systolic: number[];

	@ApiResponseProperty({
		example: [70],
	})
	diastolic: number[];
}

export class FilterVitalHistoriesDto extends PickType(PaginationRequestDto, [
	'page',
	'pageSize',
]) {
	// @ApiProperty()
	// @IsNotEmpty()
	// @IsMongoId()
	// patientId: string;
	//
	// @ApiPropertyOptional({
	// 	enum: VitalType,
	// })
	// @IsOptional()
	// @IsEnum(VitalType)
	// vitalType: string;
	//
	// @ApiPropertyOptional({
	// 	enum: ['normal', 'elevated', 'critical'],
	// })
	// @IsOptional()
	// @IsEnum(['normal', 'elevated', 'critical'])
	// severity: string;
}
