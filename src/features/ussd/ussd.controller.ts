import { Body, Controller, Header, HttpCode, Post } from '@nestjs/common';
import { seconds, Throttle } from '@nestjs/throttler';
import { UssdSessionDto } from './dto/ussd-session.dto';
import { UssdService } from './ussd.service';

@Controller('ussd')
export class UssdController {
	constructor(private readonly ussdService: UssdService) {}

	// This single endpoint receives every USSD session from every user,
	// funneled through the telco's shared gateway IP, so the app-wide
	// per-IP default would rate-limit all USSD users collectively. Key by
	// phone number instead, with a per-phone limit sized for a normal
	// menu-navigation session.
	@Throttle({
		default: {
			limit: 20,
			ttl: seconds(60),
			getTracker: (req) => req.body?.phoneNumber || req.ip,
		},
	})
	@Post()
	@HttpCode(200)
	@Header('Content-Type', 'text/plain')
	async handleSession(@Body() dto: UssdSessionDto): Promise<string> {
		return this.ussdService.handleSession(
			dto.sessionId,
			dto.phoneNumber,
			dto.text ?? '',
		);
	}
}
