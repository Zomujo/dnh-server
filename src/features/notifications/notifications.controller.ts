import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
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
import { type IUserPayload } from '@/core/firebase/interface/user.interface';
import {
	CreateNotificationDto,
	CreatePushDto,
	FilterNotificationsDto,
	GetNotificationDto,
	GetNotificationsDto,
	UpdateNotificationDto,
} from './dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Chronic Care Notifications')
@Controller('chronic-care/notifications')
export class NotificationsController {
	private logger = new Logger(NotificationsController.name);

	constructor(private readonly notificationsService: NotificationsService) {}

	@CustomApiResponse(['successNull', 'authorize'], {
		message: 'Client FCM token added succesffully',
	})
	@Post('fcm-tokens')
	@HttpCode(HttpStatus.OK)
	async addClientFcm(
		@Body() createPushDto: CreatePushDto,
		@GetUser() user: IUserPayload,
	) {
		try {
			await this.notificationsService.addFcmToken(createPushDto, user);
			return new ApiSuccessResponseNoData(
				HttpStatus.OK,
				'Client FCM token added succesffully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['successNull', 'authorize'], {
		message: 'FCM token removed succesffully',
	})
	@Delete('fcm-tokens')
	async removeFcm(@Body() dto: CreatePushDto, @GetUser('sub') userId: string) {
		try {
			await this.notificationsService.removeFcmToken(dto, userId);
			return new ApiSuccessResponseNoData(
				HttpStatus.OK,
				'FCM token removed succesffully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['created'], {
		message: 'Notification created successfully',
	})
	@Post()
	async create(@Body() createNotificationDto: CreateNotificationDto) {
		try {
			const response = await this.notificationsService.create(
				createNotificationDto,
			);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.CREATED,
				'Notification created successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['paginated'], {
		type: GetNotificationsDto,
		message: 'Notifications fetched successfully',
	})
	@Get()
	async findAll(@Query() query: FilterNotificationsDto) {
		try {
			const response = await this.notificationsService.findAll(query);
			const paginated = new PaginatedDataResponseDto(
				response.rows,
				query.page,
				query.pageSize,
				response.count,
			);

			return new ApiSuccessResponseDto(
				paginated,
				HttpStatus.OK,
				'Notifications fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'notfound'], {
		type: GetNotificationDto,
		message: 'Notification fetched successfully',
	})
	@Get(':id')
	async findOne(@Param('id', ParseMongoIdPipe) id: string) {
		try {
			const response = await this.notificationsService.findOne(id);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Notification fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['updated', 'notfound'], {
		message: 'Notification updated successfully',
	})
	@Patch(':id')
	async update(
		@Param('id', ParseMongoIdPipe) id: string,
		@Body() updateNotificationDto: UpdateNotificationDto,
	) {
		try {
			const response = await this.notificationsService.update(
				id,
				updateNotificationDto,
			);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Notification updated successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['successNull', 'notfound'], {
		message: 'Notification deleted successfully',
	})
	@Delete(':id')
	async remove(@Param('id', ParseMongoIdPipe) id: string) {
		try {
			await this.notificationsService.remove(id);
			return new ApiSuccessResponseNoData(
				HttpStatus.OK,
				'Notification deleted successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}
}
