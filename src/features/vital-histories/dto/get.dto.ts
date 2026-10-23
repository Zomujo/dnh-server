import { BadRequestException } from '@nestjs/common';
import {
	ApiProperty,
	ApiPropertyOptional,
	ApiResponseProperty,
	IntersectionType,
	PickType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	IsDate,
	IsEnum,
	IsMongoId,
	IsNotEmpty,
	IsOptional,
	IsTimeZone,
	ValidateIf,
} from 'class-validator';
import { differenceInDays } from 'date-fns';
import { GenericResponseDto, PaginationRequestDto } from '@/common/dto';
import { PatientDto } from '../../patients/dto';
import {
	CreateVitalHistoryDto,
	DateRange,
	getDateRangeFilter,
	VitalType,
} from './create.dto';

export const MAX_TREND_WINDOW_DAYS = 366;

import { VitalHistoryDto } from './vital-history.dto';

export class GetVitalHistoryDto extends IntersectionType(
	PickType(VitalHistoryDto, [
		'vitalType',
		'vitalSubType',
		'value',
		'severity',
		'unit',
		'recordedAt',
	]),
	PickType(GenericResponseDto, ['id', 'createdAt']),
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

	@ApiPropertyOptional({
		enum: DateRange,
		description: 'Preset window. Required unless `from` and `to` are sent.',
	})
	@ValidateIf((o) => o.from === undefined && o.to === undefined)
	@IsEnum(DateRange)
	dateRange?: DateRange;

	@ApiPropertyOptional({
		description: `Start of a custom window (ISO 8601). Send with \`to\`; overrides \`dateRange\`. At most ${MAX_TREND_WINDOW_DAYS} days.`,
		example: '2026-10-16T00:00:00+00:00',
		type: String,
		format: 'date-time',
	})
	@ValidateIf((o) => o.from !== undefined || o.to !== undefined)
	@Type(() => Date)
	@IsDate()
	from?: Date;

	@ApiPropertyOptional({
		description: 'End of a custom window (ISO 8601). Send with `from`.',
		example: '2026-10-23T23:59:59+00:00',
		type: String,
		format: 'date-time',
	})
	@ValidateIf((o) => o.from !== undefined || o.to !== undefined)
	@Type(() => Date)
	@IsDate()
	to?: Date;

	@ApiPropertyOptional({
		description:
			'IANA time zone for the day/month boundaries of `dateRange` (default: server time). Ignored with `from`/`to`.',
		example: 'Africa/Accra',
	})
	@IsOptional()
	@IsTimeZone()
	tz?: string;
}

/**
 * The recordedAt window for a trends query: the explicit from/to when sent,
 * else the dateRange preset (in `tz` when given).
 */
export function resolveTrendWindow(
	query: Pick<VitalHistoryTrendsQueryDto, 'dateRange' | 'from' | 'to' | 'tz'>,
): { $gte: Date; $lte: Date } {
	if (query.from && query.to) {
		if (query.from > query.to) {
			throw new BadRequestException('from must be before to');
		}
		if (differenceInDays(query.to, query.from) > MAX_TREND_WINDOW_DAYS) {
			throw new BadRequestException(
				`The window can be at most ${MAX_TREND_WINDOW_DAYS} days`,
			);
		}
		return { $gte: query.from, $lte: query.to };
	}
	const preset = query.dateRange
		? getDateRangeFilter(query.dateRange, query.tz)
		: undefined;
	if (!preset) {
		throw new BadRequestException('Send dateRange, or both from and to');
	}
	return preset.timestamp;
}

export class BpTrendsQueryDto extends PickType(VitalHistoryTrendsQueryDto, [
	'dateRange',
	'from',
	'to',
	'tz',
]) {}

export class VitalHistoryTrendsResponseDto {
	@ApiResponseProperty()
	labels: string[];

	@ApiResponseProperty({
		example: [10],
	})
	values: number[];

	@ApiResponseProperty({ example: 50 })
	latestValue: number | null;

	@ApiResponseProperty({ example: 'Patient reported mild headache' })
	note: string | null;
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

	@ApiResponseProperty({ example: '120/80' })
	latestValue: string | null;

	@ApiResponseProperty({ example: 'Patient reported mild headache' })
	note: string | null;
}

export class FilterVitalHistoriesDto extends PickType(PaginationRequestDto, [
	'page',
	'pageSize',
]) {
	@ApiProperty()
	@IsNotEmpty()
	@IsMongoId()
	patientId: string;
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

class SeverityConditionDto {
	@ApiResponseProperty({ enum: ['systolic', 'diastolic', 'value'] })
	field: string;

	@ApiProperty({
		required: false,
		description: 'Matches when the reading is >= this',
	})
	gte?: number;

	@ApiProperty({
		required: false,
		description: 'Matches when the reading is < this',
	})
	lt?: number;
}

class SeverityRuleDto {
	@ApiResponseProperty({ example: 'hypertensive_crisis' })
	label: string;

	@ApiProperty({
		type: [SeverityConditionDto],
		required: false,
		description:
			'The rule matches when any condition holds. No conditions: always matches.',
	})
	any?: SeverityConditionDto[];
}

class SeverityRuleSetDto {
	@ApiResponseProperty({ example: 'mmHg' })
	unit: string;

	@ApiProperty({
		type: [SeverityRuleDto],
		description: 'Checked in order; the first match wins.',
	})
	rules: SeverityRuleDto[];
}

export class SeverityThresholdsDto {
	@ApiProperty({
		example: '40785e3ee791',
		description: 'Changes whenever any cutoff or label changes.',
	})
	version: string;

	@ApiProperty({
		type: SeverityRuleSetDto,
		description: 'Reading as "systolic/diastolic".',
	})
	bloodPressure: SeverityRuleSetDto;

	@ApiProperty({ type: SeverityRuleSetDto })
	bloodSugar: SeverityRuleSetDto;

	@ApiProperty({
		example: [
			'critical',
			'hypertensive_crisis',
			'severe_hypotension',
			'critically_low',
			'critically_high',
		],
		description: 'Labels treated as an emergency.',
	})
	critical: string[];

	@ApiProperty({
		example: 'normal',
		description: 'Label for other vital types and unparseable values.',
	})
	default: string;
}
