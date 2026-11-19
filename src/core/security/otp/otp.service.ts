import * as crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AttemptLimit, AttemptLimiter } from '../../caching/attempt-limiter';
import { CacheService } from '../../caching/caching.service';
import { GenerateOtpDto, VerifyOtpDto } from './dto';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Codes sent to one address per hour. Each code is emailed, so without a
 * per-address cap anyone could flood an inbox through the public re-send
 * route, spreading requests over many IPs to get past the per-IP limit.
 */
export const OTP_SEND_LIMIT: AttemptLimit = {
	name: 'otp-send',
	max: 5,
	windowMs: HOUR_MS,
	blockMs: HOUR_MS,
};

@Injectable()
export class OtpService {
	private readonly defaultTtl: number;

	constructor(
		private readonly cacheService: CacheService<string>,
		private readonly configService: ConfigService,
		private readonly attemptLimiter: AttemptLimiter,
	) {
		// Default TTL in ms (10 minutes = 600,000 ms)
		this.defaultTtl = this.configService.get<number>('OTP_TTL')
			? Number(this.configService.get<number>('OTP_TTL'))
			: 10 * 60 * 1000;
	}

	/** Throws a 429 once the identifier has had OTP_SEND_LIMIT codes. */
	async generate(payload: GenerateOtpDto): Promise<number> {
		const subject = payload.identifier.toLowerCase();
		await this.attemptLimiter.assertAllowed(OTP_SEND_LIMIT, subject);
		await this.attemptLimiter.record(OTP_SEND_LIMIT, subject);

		const otp = crypto.randomInt(100000, 1000000);
		const hashedOtp = await bcrypt.hash(otp.toString(), 10);
		const cacheKey = `otp:${payload.identifier}`;
		const ttl = payload.ttl ?? this.defaultTtl;

		await this.cacheService.set(cacheKey, hashedOtp, ttl);
		return otp;
	}

	/**
	 * Single use: the stored code is deleted on any attempt, right or wrong.
	 * Reads the exact key generate() wrote. It used to SCAN with the
	 * identifier as a MATCH pattern, so glob characters in an email (a valid
	 * `*@example.com`) matched, and deleted, other users' codes.
	 */
	async verify(payload: VerifyOtpDto): Promise<boolean> {
		const cacheKey = `otp:${payload.identifier}`;
		// take() hands the stored code to one caller only, so parallel
		// requests cannot each try a guess against the same code.
		const hashedOtp = await this.cacheService.take(cacheKey);
		if (!hashedOtp) {
			return false;
		}
		return bcrypt.compare(payload.code.toString(), hashedOtp);
	}
}
