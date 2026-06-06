import { Controller, Get, HttpStatus, Logger, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CustomApiResponse, GetUser, Roles } from '@/common/decorators';
import { ParseMongoIdPipe } from '@/common/decorators/validators/pipes';
import { ApiSuccessResponseDto, throwError } from '@/common/dto';
import {
	GetPharmacyAnalyticsDto,
	QueryPharmacyAnalyticsDto,
} from '../pharmacies/dto';
import { PersonnelRoles } from './auth/dto';
import { DoctorsService } from './doctors.service';

@ApiTags('Chronic Care Doctors')
@Controller('chronic-care/doctors')
@Roles(PersonnelRoles.CLINICIAN)
export class DoctorsController {
	private logger = new Logger(DoctorsController.name);
	constructor(private readonly doctorsService: DoctorsService) {}

	@CustomApiResponse(['success', 'authorizeChronicCare'], {
		type: GetPharmacyAnalyticsDto,
		message: 'Doctors analytics fetched successfully',
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
			const response = await this.doctorsService.fetchAnalytics(
				query,
				personnelId,
			);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Doctors analytics fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['updated', 'authorizeChronicCare'], {
		message: 'Doctor referral code fetched successfully',
	})
	@Get('referral-code')
	async getReferralCode(@GetUser('sub', ParseMongoIdPipe) personnelId: string) {
		try {
			const response = await this.doctorsService.fetchReferralCode(personnelId);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Doctor referral code fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}
}
