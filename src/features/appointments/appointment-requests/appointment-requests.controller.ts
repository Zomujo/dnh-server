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
import { ParseMongoIdPipe } from '@/common/decorators/validators/pipes';
import {
	ApiSuccessResponseDto,
	ApiSuccessResponseNoData,
	PaginatedDataResponseDto,
	throwError,
} from '@/common/utils/responses';
import { AppointmentRequestsService } from './appointment-requests.service';
import {
	CreateAppointmentRequestDto,
	GetAppointmentRequestDto,
	GetAppointmentRequestsQueryDto,
	UpdateAppointmentRequestDto,
} from './dto';

@ApiTags('Appointment Requests')
@Controller('appointment-requests')
export class AppointmentRequestsController {
	private readonly logger = new Logger(AppointmentRequestsController.name);

	constructor(
		private readonly appointmentRequestsService: AppointmentRequestsService,
	) {}

	@CustomApiResponse(['success'], {
		type: GetAppointmentRequestDto,
		message: 'Appointment request created successfully',
	})
	@Post()
	async create(@Body() dto: CreateAppointmentRequestDto) {
		try {
			const response = await this.appointmentRequestsService.create(dto);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.CREATED,
				'Appointment request created successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['paginated'], {
		type: GetAppointmentRequestDto,
		message: 'Appointment requests fetched successfully',
	})
	@Get()
	async findAll(@Query() query: GetAppointmentRequestsQueryDto) {
		try {
			const response = await this.appointmentRequestsService.findAll(query);
			const paginated = new PaginatedDataResponseDto(
				response.rows,
				query.page,
				query.pageSize,
				response.count,
			);
			return new ApiSuccessResponseDto(
				paginated,
				HttpStatus.OK,
				'Appointment requests fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success'], {
		type: GetAppointmentRequestDto,
		message: 'Appointment request fetched successfully',
	})
	@Get(':id')
	async findOne(@Param('id', ParseMongoIdPipe) id: string) {
		try {
			const response = await this.appointmentRequestsService.findOne(id);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Appointment request fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success'], {
		type: GetAppointmentRequestDto,
		message: 'Appointment request updated successfully',
	})
	@Patch(':id')
	async update(
		@Param('id', ParseMongoIdPipe) id: string,
		@Body() dto: UpdateAppointmentRequestDto,
	) {
		try {
			const response = await this.appointmentRequestsService.update(id, dto);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Appointment request updated successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success'], {
		type: ApiSuccessResponseNoData,
		message: 'Appointment request deleted successfully',
	})
	@Delete(':id')
	async remove(@Param('id', ParseMongoIdPipe) id: string) {
		try {
			await this.appointmentRequestsService.remove(id);
			return new ApiSuccessResponseDto(
				null,
				HttpStatus.OK,
				'Appointment request deleted successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}
}
