import {
	ApiProperty,
	ApiPropertyOptional,
	ApiResponseProperty,
	PickType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	IsArray,
	IsBoolean,
	IsDate,
	IsEnum,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	IsTimeZone,
	MinDate,
	ValidateNested,
} from 'class-validator';
import { addMonths } from 'date-fns';
import { getAllIANATimezones } from '@/common/utils/helpers/iana-timezones.helper';
import { TargetType } from '@/features/adherences/dto/target-type.enum';
import { PatientDto } from '../../patients/dto/patient.dto';

export enum NotificationType {
	REMINDER = 'reminder',
	ALERT = 'alert',
	UPDATE = 'update',
	PROMOTION = 'promotion',
	MOTIVATION = 'motivation',
	SYSTEM = 'system',
}

export enum NotificationTone {
	FRIENDLY = 'friendly',
	PROFESSIONAL = 'professional',
	URGENT = 'urgent',
	CASUAL = 'casual',
	EMPATHETIC = 'empathetic',
}

export enum NotificationChannel {
	SMS = 'sms',
	PUSH = 'push',
	EMAIL = 'email',
	IN_APP = 'in_app',
}

export enum NotificationPriority {
	LOW = 'low',
	MEDIUM = 'medium',
	HIGH = 'high',
}

export enum RepetitionType {
	EVERY_SECOND = 'everySecond',
	EVERY_MINUTE = 'everyMinute',
	HOURLY = 'hourly',
	DAILY = 'daily',
	WEEKLY = 'weekly',
	MONTHLY = 'monthly',
	YEARLY = 'yearly',
}

export const IANATimezones = getAllIANATimezones();

export class Frequency {
	@ApiProperty({
		description: 'Number of time units between each repetition',
		example: 2,
	})
	@IsNumber()
	repeatEvery: number;

	@ApiProperty({
		description: 'Unit of time for repetition',
		enum: RepetitionType,
		example: RepetitionType.DAILY,
	})
	@IsEnum(RepetitionType)
	repetitionType: RepetitionType;
}

class ModifiedPatientDto extends PickType(PatientDto, ['name', 'timezone']) {
	@ApiResponseProperty({
		example: '678fa53f3a0ba70822aa3555',
	})
	id: string;
}

export class NotificationDto {
	@ApiProperty({
		description: 'Type/category of notification',
		enum: NotificationType,
		example: NotificationType.REMINDER,
	})
	@IsEnum(NotificationType)
	notificationType: NotificationType;

	@ApiResponseProperty({
		type: ModifiedPatientDto,
	})
	patient: ModifiedPatientDto;

	@ApiProperty({
		description: 'Date and time when notifications should start',
		example: new Date(),
	})
	@IsDate()
	@Type(() => Date)
	startDate: Date;

	@ApiPropertyOptional({
		description: 'Optional date and time when notifications should stop',
		example: addMonths(new Date(), 3),
	})
	@IsDate()
	@Type(() => Date)
	@IsOptional()
	@MinDate(new Date())
	endDate?: Date;

	@ApiProperty({
		description: 'Desired tone or style of the message',
		enum: NotificationTone,
		example: NotificationTone.FRIENDLY,
	})
	@IsEnum(NotificationTone)
	tone: NotificationTone;

	@ApiProperty({
		description: 'Type/category of adherence target',
		enum: TargetType,
		example: 'medication',
	})
	@IsEnum(TargetType)
	targetType: TargetType;

	@ApiProperty({
		description: 'Adherence target name',
		example: 'Amlodipine',
	})
	@IsNotEmpty()
	targetName: string;

	@ApiProperty({
		description: 'Delivery channel for the notification',
		enum: NotificationChannel,
		example: NotificationChannel.SMS,
	})
	@IsEnum(NotificationChannel)
	channel: NotificationChannel;

	@ApiProperty({
		description: 'Maximum character limit for the notification message',
		example: 160,
	})
	@IsNumber()
	characterLimit: number;

	@ApiProperty({
		description: 'The goal or call-to-action expected from the notification',
		example: 'Confirm attendance',
	})
	@IsString()
	goal: string;

	@ApiProperty({
		description: 'Priority of the notification',
		enum: NotificationPriority,
		example: NotificationPriority.HIGH,
	})
	@IsEnum(NotificationPriority)
	priority: NotificationPriority;

	@ApiProperty({
		description: 'List of constraints (e.g., "no emojis", "no links")',
		example: ['no emojis', 'no links'],
		required: false,
	})
	@IsArray()
	@IsString({ each: true })
	@IsOptional()
	constraints?: string[];

	@ApiProperty({
		description: 'Settings for repetitive notifications',
		type: Frequency,
		required: false,
	})
	@ValidateNested()
	@Type(() => Frequency)
	@IsOptional()
	frequency?: Frequency;

	@ApiProperty({
		description:
			'Flag to indicate if a fallback safe message should be generated if data is missing',
		example: true,
	})
	@IsBoolean()
	@IsOptional()
	useFallback?: boolean;

	@ApiPropertyOptional({
		description: 'The timezone the patient is located in',
		enum: IANATimezones,
		example: 'Africa/Accra',
	})
	@IsOptional()
	@IsTimeZone()
	timezone?: string;
}
