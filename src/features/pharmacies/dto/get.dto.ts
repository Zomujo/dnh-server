import { ApiPropertyOptional, ApiResponseProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { QueryDateRange } from '@/features/vital-histories/dto';

export class QueryPharmacyAnalyticsDto {
	@ApiPropertyOptional({ enum: QueryDateRange })
	@IsOptional()
	@IsEnum(QueryDateRange)
	dateRange: QueryDateRange;
}

export class GetPharmacyAnalyticsDto {
	@ApiResponseProperty({
		example: 5,
	})
	patientsCount: number;

	@ApiResponseProperty({
		example: 1,
	})
	vitalsRecordedCount: number;

	@ApiResponseProperty({
		example: 4,
	})
	referralsCount: number;
}
