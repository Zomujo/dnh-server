import {
	Body,
	Controller,
	Delete,
	Get,
	HttpStatus,
	Logger,
	Param,
	Patch,
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
import { PersonnelRoles } from '../../auth/dto';
import {
	GetPlannerPlanDto,
	GetPlannerPlanQueryDto,
	UpdatePlanDto,
} from './dto';
import { PlansService } from './plans.service';

@ApiTags('Chronic Care Planner Plans')
@Controller('chronic-care/doctors/planner/:patientId/plans')
@Roles(PersonnelRoles.CLINICIAN)
export class PlansController {
	private logger = new Logger(PlansController.name);
	constructor(private readonly plansService: PlansService) {}

	@CustomApiResponse(['paginated', 'authorizeChronicCare'], {
		type: GetPlannerPlanDto,
		message: 'Plans fetched successfully',
	})
	@Get()
	async findAll(
		@Param('patientId', ParseMongoIdPipe) patientId: string,
		@Query() query: GetPlannerPlanQueryDto,
	) {
		try {
			const response = await this.plansService.findAll(patientId, query);
			const paginated = new PaginatedDataResponseDto(
				response.rows,
				query.page,
				query.pageSize,
				response.count,
			);
			return new ApiSuccessResponseDto(
				paginated,
				HttpStatus.OK,
				'Plans fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'notfound', 'authorizeChronicCare'], {
		type: GetPlannerPlanDto,
		message: 'Plan fetched successfully',
	})
	@Get(':id')
	async findOne(
		@Param('patientId', ParseMongoIdPipe) patientId: string,
		@Param('id', ParseMongoIdPipe) id: string,
	) {
		try {
			const response = await this.plansService.findOne(patientId, id);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Plan fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['updated', 'notfound', 'authorizeChronicCare'], {
		message: 'Plan updated successfully',
	})
	@Patch(':id')
	async update(
		@Param('patientId', ParseMongoIdPipe) patientId: string,
		@Param('id', ParseMongoIdPipe) id: string,
		@Body() dto: UpdatePlanDto,
	) {
		try {
			dto.patient = patientId;
			const response = await this.plansService.update(id, dto);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Plan updated successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['successNull', 'notfound', 'authorizeChronicCare'], {
		message: 'Plan removed successfully',
	})
	@Delete(':id')
	async remove(
		@Param('patientId', ParseMongoIdPipe) patientId: string,
		@Param('id', ParseMongoIdPipe) id: string,
	) {
		try {
			await this.plansService.remove(patientId, id);
			return new ApiSuccessResponseNoData(
				HttpStatus.OK,
				'Plan removed successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}
}
