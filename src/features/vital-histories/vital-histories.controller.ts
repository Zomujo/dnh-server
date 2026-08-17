import {
	Body,
	Controller,
	Delete,
	Get,
	HttpStatus,
	Logger,
	Param,
	Patch,
	Post,
	Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CustomApiResponse, GetUser, Roles } from '@/common/decorators';
import { ParseMongoIdPipe } from '@/common/decorators/validators/pipes';
import {
	ApiSuccessResponseDto,
	ApiSuccessResponseNoData,
	PaginatedDataResponseDto,
	throwError,
} from '@/common/utils/responses';
import { PersonnelRoles } from '@/core/auth/enums';
import {
	BpTrendsQueryDto,
	BpTrendsResponseDto,
	CreateVitalHistoryDto,
	FilterVitalHistoriesDto,
	GetVitalHistoriesPersonnelDto,
	GetVitalHistoryPersonnelDto,
	UpdateVitalHistoryDto,
	VitalHistoryTrendsQueryDto,
	VitalHistoryTrendsResponseDto,
} from './dto';
import { VitalHistoriesService } from './vital-histories.service';

@ApiTags('Dnh Personnel-Pharmacy')
@Controller('personnel/pharmacies/vital-histories')
export class VitalHistoriesController {
	private logger = new Logger(VitalHistoriesController.name);
	constructor(private readonly vitalHistoriesService: VitalHistoriesService) {}

	@CustomApiResponse(['created', 'authorizeChronicCare'], {
		message: 'Vitals stored successfully',
	})
	@Roles(PersonnelRoles.PHARMACY)
	@Post()
	async createVitalHistory(
		@Body() dto: CreateVitalHistoryDto,
		@GetUser('sub') personnelId: string,
		@GetUser('facility') facilityId: string,
	) {
		try {
			const response = await this.vitalHistoriesService.create(
				dto,
				personnelId,
				facilityId,
			);

			return new ApiSuccessResponseDto(
				response,
				HttpStatus.CREATED,
				'Vitals stored successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	// @CacheTTL(0.0000001)
	@CustomApiResponse(['paginated', 'authorizeChronicCare'], {
		type: GetVitalHistoriesPersonnelDto,
		message: 'Vital histories fetched successfully',
	})
	@Roles(PersonnelRoles.PHARMACY)
	@Get()
	async fetchVitalHistories(@Query() query: FilterVitalHistoriesDto) {
		try {
			const response = await this.vitalHistoriesService.findAll(query);
			const paginated = new PaginatedDataResponseDto(
				response.rows,
				query.page,
				query.pageSize,
				response.count,
			);
			return new ApiSuccessResponseDto(
				paginated,
				HttpStatus.OK,
				'Vital histories fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'notfound', 'authorizeChronicCare'], {
		type: GetVitalHistoryPersonnelDto,
		message: 'Vital history fetched successfully',
	})
	@Roles(PersonnelRoles.PHARMACY)
	@Get(':id')
	async fetchVitalHistory(@Param('id', ParseMongoIdPipe) id: string) {
		try {
			const response = await this.vitalHistoriesService.findOne(id);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Vital history fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'notfound', 'authorizeChronicCare'], {
		type: BpTrendsResponseDto,
		message: 'BP trends fetched successfully',
	})
	@Roles(PersonnelRoles.PHARMACY)
	@Get(':patient_id/trends/bp')
	async fetchBpTrends(
		@Query() query: BpTrendsQueryDto,
		@Param('patient_id') userId: string,
	) {
		try {
			const response = await this.vitalHistoriesService.fetchBPTrend(
				userId,
				query,
			);

			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'BP trends fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'notfound', 'authorizeChronicCare'], {
		type: VitalHistoryTrendsResponseDto,
		message: 'Vital history trends fetched successfully',
	})
	@Roles(PersonnelRoles.PHARMACY)
	@Get(':patient_id/trends')
	async fetchVitalHistoryTrends(
		@Query() query: VitalHistoryTrendsQueryDto,
		@Param('patient_id') userId: string,
	) {
		try {
			const response = await this.vitalHistoriesService.fetchVitalTrend(
				userId,
				query,
			);

			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Vital history trends fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['updated', 'notfound', 'authorizeChronicCare'], {
		message: 'Vital history updated successfully',
	})
	@Roles(PersonnelRoles.PHARMACY)
	@Patch(':id')
	async updateVitalHistory(
		@Param('id', ParseMongoIdPipe) id: string,
		@Body() dto: UpdateVitalHistoryDto,
		@GetUser('sub') personnelId: string,
	) {
		try {
			const response = await this.vitalHistoriesService.update(
				id,
				dto,
				personnelId,
			);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Vital history updated successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['successNull', 'notfound', 'authorizeChronicCare'], {
		message: 'Vital history deleted successfully',
	})
	@Roles(PersonnelRoles.PHARMACY)
	@Delete(':id')
	async deleteVitalHistory(
		@Param('id', ParseMongoIdPipe) id: string,
		@GetUser('sub') personnelId: string,
	) {
		try {
			await this.vitalHistoriesService.remove(id, personnelId);
			return new ApiSuccessResponseNoData(
				HttpStatus.OK,
				'Vital history deleted successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}
}
