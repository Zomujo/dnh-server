import { ApiProperty, IntersectionType, PickType } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty } from 'class-validator';
import { GenericResponseDto, PaginationRequestDto } from '@/common/dto';
import { NotificationDto } from './notification.dto';

export class GetNotificationsDto extends IntersectionType(
	GenericResponseDto,
	PickType(NotificationDto, [
		'notificationType',
		'channel',
		'goal',
		'priority',
		'frequency',
	]),
) {}

export class GetNotificationDto extends IntersectionType(
	GenericResponseDto,
	NotificationDto,
) {}

export class FilterNotificationsDto extends PaginationRequestDto {
	@ApiProperty({})
	@IsNotEmpty()
	@IsMongoId()
	patientId?: string;
}
