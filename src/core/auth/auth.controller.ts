import {
	Body,
	Controller,
	Delete,
	Get,
	HttpStatus,
	Logger,
	Param,
	Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CustomApiResponse } from '@/common/decorators';
import { ParseMongoIdPipe } from '@/common/decorators/validators/pipes';
import { ApiSuccessResponseDto, throwError } from '@/common/utils/responses';
import { AuthService } from './auth.service';
import { CreateAuthDto, TestNotificationDto } from './dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
	private logger = new Logger(AuthController.name);
	constructor(private readonly authService: AuthService) {}

	@Post()
	create(@Body() createAuthDto: TestNotificationDto) {
		return this.authService.testNotification(createAuthDto);
	}

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

	@Get('test')
	async test() {
		return await this.authService.test();
	}

	@Delete(':id')
	remove(@Param('id', ParseMongoIdPipe) id: string) {
		return this.authService.remove(id);
	}
}
