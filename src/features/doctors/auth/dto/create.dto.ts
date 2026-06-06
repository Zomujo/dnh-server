import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export enum PersonnelRoles {
	CLINICIAN = 'clinician',
	PHARMACY = 'pharmacy',
}

export enum PersonnelProviders {
	GOOGLE = 'google',
}

export class CreatePersonnelDto {
	@ApiProperty({
		example: 'Kennedy Pharmacy',
		description: 'Unique username for the pharmacy',
	})
	@IsString()
	userName: string;

	@ApiProperty({
		example: 'StrongPassword123!',
		description: 'Personnel password',
	})
	@IsString()
	password: string;

	role: PersonnelRoles;

	provider?: PersonnelProviders;

	providerUserId?: string;

	@ApiPropertyOptional({
		example: 'email@example.com',
		description: 'Personnel email',
	})
	@IsOptional()
	@IsEmail()
	email?: string;
}
