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
import { PersonnelRoles } from '../../auth/dto';
import {
	CreatePlannerSessionDto,
	GetPlannerSessionDto,
	GetPlannerSessionQueryDto,
	UpdatePlannerSessionDto,
} from './dto';
import { SessionsService } from './sessions.service';

@ApiTags('Chronic Care Planner Sessions')
@Controller('chronic-care/doctors/planner/:patientId/sessions')
@Roles(PersonnelRoles.CLINICIAN)
export class SessionsController {
	private logger = new Logger(SessionsController.name);
	constructor(private readonly sessionsService: SessionsService) {}

	@CustomApiResponse(['created', 'authorizeChronicCare'], {
		type: GetPlannerSessionDto,
		message: 'Session created successfully',
	})
	@Post()
	async create(
		@Param('patientId', ParseMongoIdPipe) patientId: string,
		@GetUser('sub', ParseMongoIdPipe) personnelId: string,
	) {
		try {
			const dto: CreatePlannerSessionDto = {
				patient: patientId,
				personnel: personnelId,
			};
			const response = await this.sessionsService.create(dto);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.CREATED,
				'Session created successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['paginated', 'authorizeChronicCare'], {
		type: GetPlannerSessionDto,
		message: 'Sessions fetched successfully',
	})
	@Get()
	async findAll(
		@Param('patientId', ParseMongoIdPipe) patientId: string,
		@Query() query: GetPlannerSessionQueryDto,
	) {
		try {
			const response = await this.sessionsService.findAll(patientId, query);
			const paginated = new PaginatedDataResponseDto(
				response.rows,
				query.page,
				query.pageSize,
				response.count,
			);
			return new ApiSuccessResponseDto(
				paginated,
				HttpStatus.OK,
				'Sessions fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'notfound', 'authorizeChronicCare'], {
		type: GetPlannerSessionDto,
		message: 'Session fetched successfully',
	})
	@Get(':id')
	async findOne(
		@Param('patientId', ParseMongoIdPipe) patientId: string,
		@Param('id', ParseMongoIdPipe) id: string,
	) {
		try {
			const response = await this.sessionsService.findOne(patientId, id);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Session fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['updated', 'notfound', 'authorizeChronicCare'], {
		message: 'Session updated successfully',
	})
	@Patch(':id')
	async update(
		@Param('patientId', ParseMongoIdPipe) patientId: string,
		@Param('id', ParseMongoIdPipe) id: string,
		@Body() dto: UpdatePlannerSessionDto,
	) {
		try {
			dto.patient = patientId;
			const response = await this.sessionsService.update(id, dto);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Session updated successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['successNull', 'notfound', 'authorizeChronicCare'], {
		message: 'Session removed successfully',
	})
	@Delete(':id')
	async remove(
		@Param('patientId', ParseMongoIdPipe) patientId: string,
		@Param('id', ParseMongoIdPipe) id: string,
	) {
		try {
			await this.sessionsService.remove(patientId, id);
			return new ApiSuccessResponseNoData(
				HttpStatus.OK,
				'Session removed successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}
}
