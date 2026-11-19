import {
	Body,
	Controller,
	Delete,
	Get,
	Headers,
	HttpCode,
	HttpStatus,
	Logger,
	Post,
	UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Authorize, CustomApiResponse, GetUser } from '@/common/decorators';
import {
	ApiSuccessResponseDto,
	ApiSuccessResponseNoData,
	throwError,
} from '@/common/utils/responses';
import { AuthService } from '@/core/auth/auth.service';
import { UserType } from '@/core/auth/enums';
import { GenerateOtpDto, VerifyOtpDto } from '@/core/security/otp/dto';
import { ChronicCareAuthService } from './chronic-care-auth.service';
import {
	CreatePersonnelDto,
	GetPersonnelDto,
	LoginPersonnelDto,
	LoginPersonnelResponseDto,
} from './dto';

@ApiTags('Dnh Personnels')
@Controller('personnel/auth')
export class ChronicCareAuthController {
	private logger = new Logger(ChronicCareAuthController.name);
	constructor(
		private readonly authService: ChronicCareAuthService,
		private readonly tokenService: AuthService,
	) {}

	@CustomApiResponse(['updated'], {
		message: 'Personnel signed up successfully',
	})
	@HttpCode(HttpStatus.OK)
	@Post('signup')
	async create(@Body() dto: LoginPersonnelDto) {
		try {
			const response = await this.authService.create(dto);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.CREATED,
				'Personnel signed up successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['updated'], {
		message: 'Personnel onboarded successfully',
	})
	@HttpCode(HttpStatus.OK)
	@Post('onboard')
	async onboard(
		@Body() dto: CreatePersonnelDto,
		@Headers('authorization') authorization?: string,
	) {
		try {
			// Public for a new account's first onboarding; a Bearer token, when
			// sent, must be valid and is required to change an onboarded profile.
			const actorPersonnelId = await this.optionalPersonnelId(authorization);
			const response = await this.authService.onboard(dto, actorPersonnelId);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.CREATED,
				'Personnel onboarded successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'notfound'], {
		type: LoginPersonnelResponseDto,
		message: 'Personnel logged in successfully',
	})
	@HttpCode(HttpStatus.OK)
	@Post('login')
	async update(@Body() dto: LoginPersonnelDto) {
		try {
			const response = await this.authService.login(dto);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Personnel logged in successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'notfound'], {
		type: LoginPersonnelResponseDto,
		message: 'Google log in successful',
	})
	@HttpCode(HttpStatus.OK)
	@Post('login/google')
	async doctorLogin(@Headers('idtoken') idToken: string) {
		try {
			const response = await this.authService.googleAuth({ idToken });
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Google log in successful',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['successNull', 'notfound'], {
		message: 'OTP sent successfully',
	})
	@HttpCode(HttpStatus.OK)
	@Post('otp/re-send')
	async sendOtp(@Body() dto: GenerateOtpDto) {
		try {
			await this.authService.sendOnboardOtp(dto);
			return new ApiSuccessResponseNoData(
				HttpStatus.OK,
				'OTP sent successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'notfound'], {
		message: 'OTP verified successfully',
	})
	@HttpCode(HttpStatus.OK)
	@Post('otp/verify')
	async verifyOtp(@Body() dto: VerifyOtpDto) {
		try {
			await this.authService.verifyOnboardOtp(dto);
			return new ApiSuccessResponseNoData(
				HttpStatus.OK,
				'OTP verified successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['successNull', 'authorizeChronicCare'], {
		message: 'Personnel account deleted successfully',
	})
	@Authorize(UserType.CHRONIC_CARE)
	@Delete()
	async deletePersonnel(@GetUser('sub') personnelId: string) {
		try {
			await this.authService.deletePersonnel(personnelId);
			return new ApiSuccessResponseNoData(
				HttpStatus.OK,
				'Personnel account deleted successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'authorizeChronicCare'], {
		type: GetPersonnelDto,
		message: 'Authenticated personnel retrieved successfully',
	})
	@Get('current')
	async findOne(@GetUser('sub') personnelId: string) {
		try {
			const response = await this.authService.findAuthenticated(personnelId);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Authenticated personnel retrieved successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	private async optionalPersonnelId(
		authorization?: string,
	): Promise<string | undefined> {
		if (!authorization) return undefined;
		const [type, token] = authorization.split(' ');
		if (type !== 'Bearer' || !token) {
			throw new UnauthorizedException();
		}
		try {
			const payload = await this.tokenService.verifyChronicCareToken(token);
			return payload.sub;
		} catch {
			throw new UnauthorizedException();
		}
	}
}
