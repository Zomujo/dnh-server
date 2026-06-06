import {
	Body,
	Controller,
	Get,
	Headers,
	HttpCode,
	HttpStatus,
	Logger,
	Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CustomApiResponse, GetUser } from '@/common/decorators';
import { ApiSuccessResponseDto, throwError } from '@/common/utils/responses';
import { ChronicCareAuthService } from './chronic-care-auth.service';
import { CreatePersonnelDto, GetPersonnelDto, LoginPersonnelDto } from './dto';

@ApiTags('Chronic Care Personnels')
@Controller('chronic-care/personnel/auth')
export class ChronicCareAuthController {
	private logger = new Logger(ChronicCareAuthController.name);
	constructor(private readonly authService: ChronicCareAuthService) {}

	@CustomApiResponse(['created'], {
		message: 'Personnel created successfully',
	})
	@Post('signup')
	async create(@Body() dto: CreatePersonnelDto) {
		try {
			const response = await this.authService.create(dto);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.CREATED,
				'Personnel created successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['updated'], {
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

	@CustomApiResponse(['updated'], {
		message: 'Doctor logged in successfully',
	})
	@HttpCode(HttpStatus.OK)
	@Post('login/doctors')
	async doctorLogin(@Headers('idtoken') idToken: string) {
		try {
			const response = await this.authService.googleAuth({ idToken });
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Doctor logged in successfully',
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
}
