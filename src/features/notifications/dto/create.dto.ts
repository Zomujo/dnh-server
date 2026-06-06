import { ApiProperty, OmitType } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsMongoId, IsNotEmpty, IsString } from 'class-validator';
import { NotificationDto } from './notification.dto';

export class CreateNotificationDto extends OmitType(NotificationDto, [
	'patient',
]) {
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
		example: 'zyptyk',
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

export class AugurSendNotificationDto {
	title: string;
	body: string;
	userId: string;
	payload?: {
		actionId: string;
		notification_type: string;
		actionBtn1Display: string;
		actionBtn1Payload: string;
		actionBtn1Endpoint: string;
		actionBtn2Display: string;
		actionBtn2Payload: string;
		actionBtn2Endpoint: string;
	};
}
