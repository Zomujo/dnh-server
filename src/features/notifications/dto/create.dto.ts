import { ApiProperty, OmitType } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsMongoId, IsNotEmpty, IsString } from 'class-validator';
import { NotificationDto } from './notification.dto';

export class CreateNotificationDto extends OmitType(NotificationDto, [
	'patient',
]) {
	declare userId: string;
	@ApiProperty({
		example: 'some-mongo-id',
		description: 'ID of the patient',
		name: 'patientId',
	})
	@IsNotEmpty()
	@IsMongoId()
	@Expose({ name: 'patientId' })
	patient: string;
}

export class CreatePushDto {
	@ApiProperty({
		example:
			'eNhjvY4ES3yPLDCLchd8pC:APA91bGNMdyiYfET7rAGRdX0XpZCZ9o_CY0eB0hTy7U-ypTOcUB6YHsfmx533eS6ed-tWu7fgiUOMsfRS-ckGL-CXajHT5YPDNHv9LLa-Opywnm1h0SDTuY',
	})
	@IsNotEmpty()
	@IsString()
	fcmToken: string;
}

export class PushToTopicDto {
	@ApiProperty({
		example: 'yelima',
	})
	@IsNotEmpty()
	@IsString()
	topic: string;

	@ApiProperty({
		example: 'Update Available',
	})
	@IsNotEmpty()
	@IsString()
	title: string;

	@ApiProperty({
		example: 'Update to get the latest features',
	})
	@IsNotEmpty()
	@IsString()
	messsage: string;
}

/**
 * What a push is about, sent as `data.notification_type`. The patient app
 * opens the matching screen on tap; any other value (or none) opens home.
 */
export enum PushNotificationType {
	/** Appointment reminders and changes. Opens Appointments. */
	APPOINTMENT = 'appointment',
	/** A reading the server flagged. Opens Readings. */
	VITAL_ALERT = 'vital_alert',
	/** Server-sent medication reminders. Opens Medications. */
	MEDICATION = 'medication',
	/** AI chat messages. Opens the AI chat. */
	AI_CHAT = 'ai_chat',
}

export class AugurSendNotificationDto {
	title: string;
	body: string;
	userId: string;
	chatId?: string;
	payload?: {
		actionId?: string;
		notification_type?: string;
		appointment_id?: string;
		medication_id?: string;
		actionBtn1Display?: string;
		actionBtn1Payload?: string;
		actionBtn1Endpoint?: string;
		actionBtn2Display?: string;
		actionBtn2Payload?: string;
		actionBtn2Endpoint?: string;
	};
}

export class AugurTopicNotificationDto {
	title: string;
	body: string;
	topic: string;
	chatId?: string;
	payload?: {
		actionId?: string;
		notification_type?: string;
		appointment_id?: string;
		medication_id?: string;
		actionBtn1Display?: string;
		actionBtn1Payload?: string;
		actionBtn1Endpoint?: string;
		actionBtn2Display?: string;
		actionBtn2Payload?: string;
		actionBtn2Endpoint?: string;
	};
}
