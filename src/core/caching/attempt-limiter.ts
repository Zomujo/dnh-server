import { Injectable } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { RedisThrottlerStorage } from './throttler-redis.storage';

export interface AttemptLimit {
	/** Names the counter, e.g. 'login-attempt'. */
	name: string;
	/** Attempts allowed in the window; the next one is refused. */
	max: number;
	windowMs: number;
	/** How long the subject stays refused once over the limit. */
	blockMs: number;
}

/**
 * Counts attempts per subject (an email, not an IP) in Redis, so a limit
 * holds however many addresses the attempts come from. Uses the same atomic
 * counter as the app-wide rate limit.
 */
@Injectable()
export class AttemptLimiter {
	constructor(private readonly storage: RedisThrottlerStorage) {}

	/**
	 * Counts an attempt and throws a 429 if it is over the limit. Counting
	 * and checking are one atomic Redis step, so parallel requests cannot
	 * all pass a check before any of them is counted.
	 */
	async consume(limit: AttemptLimit, subject: string): Promise<void> {
		const result = await this.storage.increment(
			subject,
			limit.windowMs,
			limit.max,
			limit.blockMs,
			limit.name,
		);
		if (result.isBlocked) {
			throw tooMany(result.timeToBlockExpire);
		}
	}

	async reset(limit: AttemptLimit, subject: string): Promise<void> {
		await this.storage.reset(subject, limit.name);
	}
}

export function tooMany(seconds: number): ThrottlerException {
	const minutes = Math.max(1, Math.ceil(seconds / 60));
	return new ThrottlerException(
		`Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
	);
}
