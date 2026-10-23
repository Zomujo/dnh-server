import { Body, Controller, HttpStatus, Logger, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { seconds, Throttle } from '@nestjs/throttler';
import { CustomApiResponse, GetUser } from '@/common/decorators';
import { ApiSuccessResponseDto, throwError } from '@/common/utils/responses';
import { AuthService } from './auth.service';
import { CreateAuthDto, OnboardDto } from './dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
	private logger = new Logger(AuthController.name);
	constructor(private readonly authService: AuthService) {}

	// Public by design (it is the sign-up), so it gets a much tighter per-IP
	// limit than the app-wide default to slow scripted account creation.
	@Throttle({ default: { limit: 5, ttl: seconds(60) } })
	@Post('signup')
	@CustomApiResponse(['created'], {
		message: 'Patient account created successfully',
	})
	async signup(@Body() dto: CreateAuthDto) {
		try {
			const response = await this.authService.signup(dto);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.CREATED,
				'Patient account created successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@Post('onboard')
	@CustomApiResponse(['created', 'authorize'], {
		message: 'Patient onboarded successfully',
	})
	async onboard(@GetUser('sub') userId: string, @Body() dto: OnboardDto) {
		try {
			const response = await this.authService.onboarding(userId, dto);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.CREATED,
				'Patient onboarded successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}
}
