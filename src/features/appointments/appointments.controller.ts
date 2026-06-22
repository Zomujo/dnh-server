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
import { CustomApiResponse } from '@/common/decorators';
import {
	ApiSuccessResponseDto,
	PaginatedDataResponseDto,
	throwError,
} from '@/common/utils/responses';
import { AppointmentsService } from './appointments.service';
import {
	CreateAppointmentDto,
	GetAppointmentDto,
	GetAppointmentsQueryDto,
	UpdateAppointmentDto,
} from './dto';

@ApiTags('Appointments')
@Controller('appointments')
export class AppointmentsController {
	private readonly logger = new Logger(AppointmentsController.name);

	constructor(private readonly appointmentsService: AppointmentsService) {}

	@Post()
	create(@Body() createAppointmentDto: CreateAppointmentDto) {
		return this.appointmentsService.create(createAppointmentDto);
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
