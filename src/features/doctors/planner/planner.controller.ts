import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpStatus,
	Logger,
	Param,
	Post,
	Query,
	Sse,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { catchError, map, Observable, of } from 'rxjs';
import { CustomApiResponse, GetUser, Roles } from '@/common/decorators';
import { ParseMongoIdPipe } from '@/common/decorators/validators/pipes';
import {
	ApiSuccessResponseDto,
	PaginatedDataResponseDto,
	throwError,
} from '@/common/utils/responses';
import { PersonnelRoles } from '../auth/dto';
import {
	CreatePlannerDto,
	GetPlannerChatDto,
	GetPlannerChatQueryDto,
} from './dto';
import { PlannerService } from './planner.service';

@ApiTags('Chronic Care Planner Chats')
@Controller(
	'/chronic-care/doctors/planner/:patientId/sessions/:sessionId/chats',
)
@Roles(PersonnelRoles.CLINICIAN)
export class PlannerController {
	private logger = new Logger(PlannerController.name);
	constructor(private readonly plannerService: PlannerService) {}

	@CustomApiResponse(['updated', 'authorizeChronicCare'], {
		message: 'Chats sent successfully',
	})
	@Post()
	@Sse()
	@HttpCode(HttpStatus.OK)
	async create(
		@Param('patientId', ParseMongoIdPipe) patientId: string,
		@Param('sessionId', ParseMongoIdPipe) sessionId: string,
		@GetUser('sub', ParseMongoIdPipe) personnelId: string,
		@Body() dto: CreatePlannerDto,
	): Promise<Observable<MessageEvent>> {
		dto.patientId = patientId;
		dto.sessionId = sessionId;
		dto.personnelId = personnelId;
		const response = await this.plannerService.chat(dto);
		return response.pipe(
			map((data) => data),
			catchError((err) => {
				this.logger.error(
					`An error occurred during ai response streaming: ${err.name} :: ${err.message}`,
					err.stack,
				);
				return of(
					new MessageEvent('error', {
						data: { status: 'error', message: 'Stream interrupted' },
					}),
				);
			}),
		);
	}

	@CustomApiResponse(['paginated', 'authorizeChronicCare'], {
		type: GetPlannerChatDto,
		message: 'Chats fetched successfully',
	})
	@Get()
	async findAll(
		@Param('patientId', ParseMongoIdPipe) _patientId: string,
		@Param('sessionId', ParseMongoIdPipe) sessionId: string,
		@Query() query: GetPlannerChatQueryDto,
	) {
		try {
			const response = await this.plannerService.findAll(sessionId, query);
			const paginated = new PaginatedDataResponseDto(
				response.rows,
				query.page,
				query.pageSize,
				response.count,
			);
			return new ApiSuccessResponseDto(
				paginated,
				HttpStatus.OK,
				'Chats fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	// @Get('collections')
	// async listCollections(
	// 	@Param('patientId', ParseMongoIdPipe) _patientId: string,
	// 	@Param('sessionId', ParseMongoIdPipe) sessionId: string,
	// ) {
	// 	try {
	// 		return this.plannerService.listCollections();
	// 	} catch (error) {
	// 		throwError(this.logger, error);
	// 	}
	// }
	//
	// @Get('collections/:name')
	// async viewCollectionData(
	// 	@Param('patientId', ParseMongoIdPipe) _patientId: string,
	// 	@Param('sessionId', ParseMongoIdPipe) sessionId: string,
	// 	@Param('name') name: string,
	// ) {
	// 	try {
	// 		return this.plannerService.viewCollectionData(name);
	// 	} catch (error) {
	// 		throwError(this.logger, error);
	// 	}
	// }
}
