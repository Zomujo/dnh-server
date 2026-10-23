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
import { CustomApiResponse, Roles } from '@/common/decorators';
import { ParseMongoIdPipe } from '@/common/decorators/validators/pipes';
import {
	ApiSuccessResponseDto,
	ApiSuccessResponseNoData,
	PaginatedDataResponseDto,
	throwError,
} from '@/common/utils/responses';
import { PersonnelRoles } from '@/core/auth/enums';
import {
	CreateFacilityDto,
	GetFacilitiesQueryDto,
	GetFacilityDto,
	UpdateFacilityDto,
} from './dto';
import { FacilitiesService } from './facilities.service';

// Reads stay public: personnel onboarding (POST /personnel/auth/onboard)
// runs before the caller has a token and needs the facility list to pick
// from. Facility names/addresses aren't patient data. Writes are HCP-only.
@ApiTags('Facilities')
@Controller('facilities')
export class FacilitiesController {
	private readonly logger = new Logger(FacilitiesController.name);

	constructor(private readonly facilitiesService: FacilitiesService) {}

	@CustomApiResponse(['created', 'authorizeChronicCare'], {
		type: GetFacilityDto,
		message: 'Facility created successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Post()
	async create(@Body() dto: CreateFacilityDto) {
		try {
			const response = await this.facilitiesService.create(dto);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.CREATED,
				'Facility created successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['paginated'], {
		type: GetFacilityDto,
		message: 'Facilities fetched successfully',
	})
	@Get()
	async findAll(@Query() query: GetFacilitiesQueryDto) {
		try {
			const response = await this.facilitiesService.findAll(query);
			const paginated = new PaginatedDataResponseDto(
				response.rows,
				query.page,
				query.pageSize,
				response.count,
			);
			return new ApiSuccessResponseDto(
				paginated,
				HttpStatus.OK,
				'Facilities fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success'], {
		type: GetFacilityDto,
		message: 'Facility fetched successfully',
	})
	@Get(':id')
	async findOne(@Param('id', ParseMongoIdPipe) id: string) {
		try {
			const response = await this.facilitiesService.findOne(id);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Facility fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['updated', 'authorizeChronicCare'], {
		message: 'Facility updated successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Patch(':id')
	async update(
		@Param('id', ParseMongoIdPipe) id: string,
		@Body() dto: UpdateFacilityDto,
	) {
		try {
			const facilityId = await this.facilitiesService.update(id, dto);
			return new ApiSuccessResponseDto(
				facilityId,
				HttpStatus.OK,
				'Facility updated successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['successNull', 'authorizeChronicCare'], {
		type: ApiSuccessResponseNoData,
		message: 'Facility deleted successfully',
	})
	@Roles(PersonnelRoles.CLINICIAN)
	@Delete(':id')
	async remove(@Param('id', ParseMongoIdPipe) id: string) {
		try {
			await this.facilitiesService.remove(id);
			return new ApiSuccessResponseNoData(
				HttpStatus.OK,
				'Facility deleted successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}
}
