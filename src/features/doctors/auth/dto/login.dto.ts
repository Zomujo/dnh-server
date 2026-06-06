import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class LoginPersonnelDto {
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

	providerUserId?: string;
}
