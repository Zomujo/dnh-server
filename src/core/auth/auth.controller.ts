import {
	Body,
	Controller,
	HttpStatus,
	Logger,
	Post,
	Res,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { seconds, Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CustomApiResponse, GetUser, Idempotent } from '@/common/decorators';
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
	@Idempotent()
	@CustomApiResponse(['created', 'authorize'], {
		message: 'Patient onboarded successfully',
	})
	@ApiOkResponse({
		description:
			'This account was already onboarded: the existing patient id is returned and nothing is changed.',
	})
	async onboard(
		@GetUser('sub') userId: string,
		@Body() dto: OnboardDto,
		@Res({ passthrough: true }) res: Response,
	) {
		try {
			// Safe to retry: a repeat returns the same patient with 200.
			const { patientId, created } = await this.authService.onboarding(
				userId,
				dto,
			);
			const status = created ? HttpStatus.CREATED : HttpStatus.OK;
			res.status(status);
			return new ApiSuccessResponseDto(
				patientId,
				status,
				created
					? 'Patient onboarded successfully'
					: 'Patient already onboarded',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}
}
