import { Injectable } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { RedisThrottlerStorage } from './throttler-redis.storage';

export interface AttemptLimit {
	/** Names the counter, e.g. 'login-failure'. */
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

	/** Throws a 429 if the subject is currently blocked. */
	async assertAllowed(limit: AttemptLimit, subject: string): Promise<void> {
		const seconds = await this.storage.blockedFor(subject, limit.name);
		if (seconds > 0) {
			throw tooMany(seconds);
		}
	}

	/**
	 * Records an attempt. Returns the seconds the subject is now blocked for,
	 * or 0 if it is still within the limit.
	 */
	async record(limit: AttemptLimit, subject: string): Promise<number> {
		// increment() blocks once hits exceed its limit, so max - 1 makes the
		// max-th attempt the one that blocks.
		const result = await this.storage.increment(
			subject,
			limit.windowMs,
			limit.max - 1,
			limit.blockMs,
			limit.name,
		);
		return result.isBlocked ? result.timeToBlockExpire : 0;
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
