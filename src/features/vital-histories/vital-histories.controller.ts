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
import { CustomApiResponse, GetUser } from '@/common/decorators';
import { ParseMongoIdPipe } from '@/common/decorators/validators/pipes';
import {
	ApiSuccessResponseDto,
	ApiSuccessResponseNoData,
	PaginatedDataResponseDto,
	throwError,
} from '@/common/utils/responses';
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

@ApiTags('Chronic Care-Doctors-Vital-Histories')
@Controller('chronic-care/doctors/vital-histories')
export class VitalHistoriesController {
	private logger = new Logger(VitalHistoriesController.name);
	constructor(private readonly vitalHistoriesService: VitalHistoriesService) {}

	@CustomApiResponse(['created', 'authorizeChronicCare'], {
		message: 'Vitals stored successfully',
	})
	@Post()
	async createVitalHistory(
		@Body() dto: CreateVitalHistoryDto,
		@GetUser('sub') personnelId: string,
	) {
		try {
			const response = await this.vitalHistoriesService.create(
				dto,
				personnelId,
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
	@CustomApiResponse(['paginated'], {
		type: GetVitalHistoriesPersonnelDto,
		message: 'Vital histories fetched successfully',
	})
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

	@CustomApiResponse(['success', 'notfound'], {
		type: GetVitalHistoryPersonnelDto,
		message: 'Vital history fetched successfully',
	})
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

	@CustomApiResponse(['success', 'notfound'], {
		type: BpTrendsResponseDto,
		message: 'BP trends fetched successfully',
	})
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

	@CustomApiResponse(['success', 'notfound'], {
		type: VitalHistoryTrendsResponseDto,
		message: 'Vital history trends fetched successfully',
	})
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
	@Patch(':id')
	async updateVitalHistory(
		@Param('id', ParseMongoIdPipe) id: string,
		@Body() dto: UpdateVitalHistoryDto,
	) {
		try {
			const response = await this.vitalHistoriesService.update(id, dto);
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
	@Delete(':id')
	async deleteVitalHistory(@Param('id', ParseMongoIdPipe) id: string) {
		try {
			await this.vitalHistoriesService.remove(id);
			return new ApiSuccessResponseNoData(
				HttpStatus.OK,
				'Vital history deleted successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}
}
