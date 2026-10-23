import { createHash, timingSafeEqual } from 'node:crypto';
import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
	Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/**
 * Only lets Africa's Talking reach POST /ussd. The body's phoneNumber
 * decides whose vitals get written, so an unverified caller could log
 * readings for any patient whose number they know.
 *
 * Africa's Talking doesn't sign USSD callbacks, so two controls are
 * supported, each enforced when configured:
 * - USSD_CALLBACK_SECRET: register the callback URL as
 *   `.../api/v1/ussd?key=<secret>` (or send header `x-ussd-key`).
 * - USSD_ALLOWED_IPS: comma-separated source IPs (needs `trust proxy`).
 *
 * With neither set the route stays open, as before, and a warning is
 * logged at startup — set at least the secret in every deployed env.
 */
@Injectable()
export class UssdCallbackGuard implements CanActivate {
	private readonly logger = new Logger(UssdCallbackGuard.name);
	private readonly secretDigest?: Buffer;
	private readonly allowedIps: ReadonlySet<string>;

	constructor(configService: ConfigService) {
		const secret = configService.get<string>('USSD_CALLBACK_SECRET')?.trim();
		this.secretDigest = secret ? digest(secret) : undefined;
		this.allowedIps = new Set(
			(configService.get<string>('USSD_ALLOWED_IPS') ?? '')
				.split(',')
				.map((ip) => normalizeIp(ip.trim()))
				.filter(Boolean),
		);

		if (!this.secretDigest && this.allowedIps.size === 0) {
			this.logger.warn(
				'POST /ussd is unauthenticated: set USSD_CALLBACK_SECRET and/or USSD_ALLOWED_IPS.',
			);
		}
	}

	canActivate(context: ExecutionContext): boolean {
		const request = context.switchToHttp().getRequest<Request>();

		if (
			this.allowedIps.size > 0 &&
			!this.allowedIps.has(normalizeIp(request.ip ?? ''))
		) {
			this.logger.warn(`Rejected USSD callback from ${request.ip}`);
			throw new ForbiddenException();
		}

		if (this.secretDigest) {
			const provided = request.query.key ?? request.headers['x-ussd-key'];
			if (
				typeof provided !== 'string' ||
				!timingSafeEqual(digest(provided), this.secretDigest)
			) {
				this.logger.warn(`Rejected USSD callback from ${request.ip}: bad key`);
				throw new ForbiddenException();
			}
		}

		return true;
	}
}

// Fixed-length digests so timingSafeEqual never sees unequal lengths.
function digest(value: string) {
	return createHash('sha256').update(value).digest();
}

function normalizeIp(ip: string) {
	return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;
}
