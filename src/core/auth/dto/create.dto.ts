import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class TestNotificationDto {
	@ApiProperty({
		example:
			'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiI0Yzc5ZDc0My0xZDc1LTQ0ZDAtOTc4OC1mZTA',
	})
	@IsNotEmpty()
	fcmToken: string;

	@ApiProperty({ example: 'dh_ai' })
	@IsNotEmpty()
	notificationType: string;

	@ApiProperty({ example: '81a05870-393d-44dc-b272-2c314478e06d' })
	@IsNotEmpty()
	chatId: string;
}

export class CreateAuthDto {
	@ApiProperty({ example: 'user@email.com' })
	@IsNotEmpty()
	// @IsEmail()
	email: string;

	@ApiProperty({ example: 'FiGgjHM5y767&' })
	@IsNotEmpty()
	password: string;
}

export class GoogleLoginDto {
	@ApiProperty({
		example:
			'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiI0Yzc5ZDc0My0xZDc1LTQ0ZDAtOTc4OC1mZTA',
	})
	@IsNotEmpty()
	idToken: string;
}

export class UserPayload {
	name: string;
	phoneNumber: string;
}
