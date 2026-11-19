import * as crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { CacheService } from '../../caching/caching.service';
import { GenerateOtpDto, VerifyOtpDto } from './dto';

@Injectable()
export class OtpService {
	private readonly defaultTtl: number;

	constructor(
		private readonly cacheService: CacheService<string>,
		private readonly configService: ConfigService,
	) {
		// Default TTL in ms (10 minutes = 600,000 ms)
		this.defaultTtl = this.configService.get<number>('OTP_TTL')
			? Number(this.configService.get<number>('OTP_TTL'))
			: 10 * 60 * 1000;
	}

	async generate(payload: GenerateOtpDto): Promise<number> {
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
