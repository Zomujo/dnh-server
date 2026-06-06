import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ParseMongoIdPipe } from '@/common/decorators/validators/pipes';
import { AuthService } from './auth.service';
import { TestNotificationDto } from './dto';

@Controller('auth')
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Post()
	create(@Body() createAuthDto: TestNotificationDto) {
		return this.authService.testNotification(createAuthDto);
		// return this.authService.login(createAuthDto);
	}

	@Get('test')
	async test() {
		return await this.authService.test();
	}

	// @Authorize(UserType.DH_CLIENTS)
	// @Get('user')
	// findOne(@GetUser() user: IUserPayload) {
	// 	return this.authService.findUser(user);
	// }

	@Delete(':id')
	remove(@Param('id', ParseMongoIdPipe) id: string) {
		return this.authService.remove(id);
	}
}
