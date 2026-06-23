import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsArray,
	IsEmail,
	IsEnum,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	MinLength,
} from 'class-validator';
import { GenderEnum } from '@/features/patients/entities/patient.entity';

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
	@IsEmail()
	email: string;

	@ApiProperty({ example: 'FiGgjHM5y767&' })
	@IsNotEmpty()
	@MinLength(6)
	password: string;
}

export class OnboardDto {
	@ApiPropertyOptional({ example: 'GHA-123456789-0' })
	@IsString()
	@IsOptional()
	ghanaCardNumber: string;

	@ApiProperty({ example: 'John' })
	@IsString()
	@IsNotEmpty()
	firstname: string;

	@ApiProperty({ example: 'Doe' })
	@IsString()
	@IsNotEmpty()
	lastname: string;

	@ApiProperty({
		description: 'Gender of the patient',
		enum: GenderEnum,
		example: 'male',
	})
	@IsEnum(GenderEnum)
	gender: GenderEnum;

	@ApiPropertyOptional({ example: 'NHIS-123456789' })
	@IsString()
	@IsOptional()
	nhisNumber?: string;

	@ApiProperty({ example: 1990 })
	@IsNumber()
	@IsNotEmpty()
	yearOfBirth: number;

	@ApiProperty({ example: ['hypertension', 'diabetes'] })
	@IsArray()
	@IsString({ each: true })
	@IsNotEmpty()
	chronicConditions: string[];
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
