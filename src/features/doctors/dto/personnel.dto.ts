import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { GenericResponseDto } from '@/common/dto';

export class PersonnelDto extends GenericResponseDto {
	@ApiProperty({
		example: 'John Doe',
		description: 'The name of the user or pharmacy',
	})
	@IsString()
	userName: string;

	@ApiPropertyOptional({
		example: 'google',
		description: 'The SSO authentication provider',
	})
	@IsOptional()
	@IsString()
	provider: string;

	@ApiPropertyOptional({
		example: 'some-id',
		description: 'The SSO authentication provider user id',
	})
	@IsOptional()
	@IsString()
	providerUserId: string;

	@ApiPropertyOptional({
		example: 'example@email.com',
		description: "The user's email address",
	})
	@IsOptional()
	@IsEmail()
	email: string;
}
