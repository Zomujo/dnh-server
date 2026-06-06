import { Controller, Get, HttpStatus, Logger, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CustomApiResponse, GetUser } from '@/common/decorators';
import { ParseMongoIdPipe } from '@/common/decorators/validators/pipes';
import { ApiSuccessResponseDto, throwError } from '@/common/utils/responses';
import { GetPharmacyAnalyticsDto, QueryPharmacyAnalyticsDto } from './dto';
import { PharmaciesService } from './pharmacies.service';

@ApiTags('Chronic Care Pharmacies')
@Controller('chronic-care/pharmacies')
export class PharmaciesController {
	private logger = new Logger(PharmaciesController.name);
	constructor(private readonly pharmaciesService: PharmaciesService) {}

	@CustomApiResponse(['success', 'authorizeChronicCare'], {
		type: GetPharmacyAnalyticsDto,
		message: 'Pharmacy analytics fetched successfully',
	})
	@ApiOperation({
		description:
			'if dateRange is left empty, it will default to fetching everything',
	})
	@Get('analytics')
	async getAnalytics(
		@Query() query: QueryPharmacyAnalyticsDto,
		@GetUser('sub', ParseMongoIdPipe) personnelId: string,
	) {
		try {
			const response = await this.pharmaciesService.fetchAnalytics(
				query,
				personnelId,
			);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Pharmacy analytics fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['updated', 'authorizeChronicCare'], {
		message: 'Pharmacy referral code fetched successfully',
	})
	@Get('referral-code')
	async getReferralCode(@GetUser('sub', ParseMongoIdPipe) personnelId: string) {
		try {
			const response =
				await this.pharmaciesService.fetchReferralCode(personnelId);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Pharmacy referral code fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}
}
