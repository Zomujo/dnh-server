import { ApiProperty, PickType } from '@nestjs/swagger';
import { IsArray, IsNotEmpty } from 'class-validator';
import {
	endOfDay,
	endOfMonth,
	endOfYear,
	startOfDay,
	startOfMonth,
	startOfYear,
	subDays,
	subHours,
	subMonths,
} from 'date-fns';
import { VitalHistoryDto } from './vital-history.dto';

export const shortenedDay: Record<string, string> = {
	Mon: 'M',
	Monday: 'Mo',
	Tue: 'T',
	Tuesday: 'Tu',
	Wed: 'W',
	Wednesday: 'We',
	Thu: 'T',
	Thursday: 'Th',
	Fri: 'F',
	Friday: 'Fr',
	Sat: 'S',
	Saturday: 'Sa',
	Sun: 'S',
	Sunday: 'Su',
};

export const fullDayMap: Record<string, string> = {
	Mon: 'Monday',
	Tue: 'Tuesday',
	Wed: 'Wednesday',
	Thu: 'Thursday',
	Fri: 'Friday',
	Sat: 'Saturday',
	Sun: 'Sunday',
};

export enum VitalType {
	BLOOD_PRESSURE = 'bloodPressure',
	HEART_RATE = 'heartRate',
	TEMPERATURE = 'temperature',
	RESPIRATION_RATE = 'respirationRate',
	OXYGEN_SATURATION = 'oxygenSaturation',
	WEIGHT = 'weight',
	BLOOD_SUGAR = 'bloodSugar',
}

class VitalHistoryInputDto extends PickType(VitalHistoryDto, [
	'vitalType',
	'value',
	'unit',
	'severity',
]) {}

export class CreateVitalHistoryDto extends PickType(VitalHistoryDto, [
	'notes',
	'patient',
	'recordedAt',
]) {
	@ApiProperty({
		type: [VitalHistoryInputDto],
	})
	@IsNotEmpty()
	@IsArray()
	vitals: VitalHistoryInputDto[];
}

export enum DateRange {
	TODAY = 'today',
	THIS_WEEK = 'thisWeek',
	THIS_MONTH = 'thisMonth',
	LAST_MONTH = 'lastMonth',
}

export enum QueryDateRange {
	TODAY = 'today',
	THIS_WEEK = 'thisWeek',
	THIS_MONTH = 'thisMonth',
	LAST_MONTH = 'lastMonth',
	LAST_30_DAYS = 'last30Days',
	LAST_THREE_MONTHS = 'lastThreeMonths',
	THIS_YEAR = 'thisYear',
}

export const getDateRangeFilter = (
	dateRange: DateRange | QueryDateRange,
): { timestamp: { $gte: Date; $lte: Date }; groupby?: string } | undefined => {
	const now = new Date();

	switch (dateRange) {
		case DateRange.TODAY:
			return {
				timestamp: {
					$gte: startOfDay(subHours(now, 24)),
					$lte: endOfDay(now),
				},
				groupby: 'hour',
			};

		case DateRange.THIS_WEEK:
			return {
				timestamp: {
					$gte: startOfDay(subDays(now, 7)),
					$lte: endOfDay(now),
				},
				groupby: 'day',
			};

		case DateRange.THIS_MONTH:
			return {
				timestamp: {
					$gte: startOfDay(subMonths(now, 1)),
					$lte: endOfDay(now),
				},
				groupby: 'week',
			};

		case QueryDateRange.LAST_30_DAYS:
			return {
				timestamp: {
					$gte: startOfDay(subMonths(now, 1)),
					$lte: endOfDay(now),
				},
				groupby: 'week',
			};

		case DateRange.LAST_MONTH: {
			const lastMonth = subMonths(now, 1);
			return {
				timestamp: {
					$gte: startOfMonth(lastMonth),
					$lte: endOfMonth(lastMonth),
				},
				groupby: 'day',
			};
		}

		case QueryDateRange.LAST_THREE_MONTHS: {
			const lastThreeMonths = subMonths(now, 3);
			return {
				timestamp: {
					$gte: startOfMonth(lastThreeMonths),
					$lte: endOfMonth(now),
				},
				groupby: 'week',
			};
		}

		case QueryDateRange.THIS_YEAR:
			return {
				timestamp: {
					$gte: startOfYear(now),
					$lte: endOfYear(now),
				},
				groupby: 'month',
			};

		default:
			return undefined;
	}
};
