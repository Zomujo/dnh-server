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
import {
	Authorize,
	CustomApiResponse,
	GetUser,
	Roles,
} from '@/common/decorators';
import { ParseMongoIdPipe } from '@/common/decorators/validators/pipes';
import {
	ApiSuccessResponseDto,
	PaginatedDataResponseDto,
	throwError,
} from '@/common/utils/responses';
import { PersonnelRoles, UserType } from '@/core/auth/enums';
import { AppointmentsService } from './appointments.service';
import {
	CreateAppointmentDto,
	GetAppointmentDto,
	GetAppointmentsQueryDto,
	UpdateAppointmentDto,
} from './dto';

@ApiTags('Appointments')
@Authorize(UserType.CHRONIC_CARE)
@Roles(PersonnelRoles.CLINICIAN)
@Controller('appointments')
export class AppointmentsController {
	private readonly logger = new Logger(AppointmentsController.name);

	constructor(private readonly appointmentsService: AppointmentsService) {}

	@Post()
	create(
		@GetUser('sub', ParseMongoIdPipe) personnelId: string,
		@Body() createAppointmentDto: CreateAppointmentDto,
	) {
		// The host is always the caller; a client-supplied hostPersonnelId
		// would let one clinician create appointments owned by another, who
		// is the only one allowed to cancel/reschedule/complete them.
		return this.appointmentsService.create({
			...createAppointmentDto,
			hostPersonnel: personnelId,
		});
	}

	@CustomApiResponse(['paginated'], {
		type: GetAppointmentDto,
		message: 'Appointments fetched successfully',
	})
	@Get()
	async findAll(@Query() query: GetAppointmentsQueryDto) {
		try {
			const response = await this.appointmentsService.findAll(query);
			const paginated = new PaginatedDataResponseDto(
				response.rows,
				query.page,
				query.pageSize,
				response.count,
			);

			return new ApiSuccessResponseDto(
				paginated,
				HttpStatus.OK,
				'Appointments fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@Get(':id')
	findOne(@Param('id') id: string) {
		return this.appointmentsService.findOne(+id);
	}

	@Patch(':id')
	update(
		@Param('id') id: string,
		@Body() updateAppointmentDto: UpdateAppointmentDto,
	) {
		return this.appointmentsService.update(+id, updateAppointmentDto);
	}

	@Delete(':id')
	remove(@Param('id') id: string) {
		return this.appointmentsService.remove(+id);
	}
}
