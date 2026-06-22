import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import {
	IsEmail,
	IsEnum,
	IsMongoId,
	IsOptional,
	IsString,
} from 'class-validator';

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

	@ApiPropertyOptional({
		example: 'clinician',
		description: 'Personnel Role',
	})
	@IsOptional()
	@IsEnum(PersonnelRoles)
	role?: PersonnelRoles;

	provider?: PersonnelProviders;

	providerUserId?: string;

	@ApiPropertyOptional({
		example: 'email@example.com',
		description: 'Personnel email',
	})
	@IsOptional()
	@IsEmail()
	email?: string;

	@ApiPropertyOptional({
		description: 'Facility ID (MongoDB ObjectId) this personnel belongs to',
		example: '664b7f8e2c2a1e4b8f1d2c3a4',
		name: 'facilityId',
	})
	@Expose({ name: 'facilityId' })
	@IsOptional()
	@IsString()
	@IsMongoId()
	facility?: string;
}
