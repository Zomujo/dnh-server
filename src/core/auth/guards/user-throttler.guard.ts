import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * The app-wide rate limit, keyed on the verified caller where there is one.
 *
 * Registered after AuthGuard (see AuthModule), so `req.user` is already
 * populated on authorized routes. Keying those on the user means patients
 * who share one carrier/NAT IP no longer share one budget, and one user
 * can't burn everyone else's. Public routes fall back to the client IP,
 * which is only meaningful because `trust proxy` is set in main.ts.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
	protected async getTracker(req: Record<string, any>): Promise<string> {
		const userId: string | undefined = req.user?.sub ?? req.user?.uid;
		return userId ? `user:${userId}` : `ip:${req.ip}`;
	}
}
