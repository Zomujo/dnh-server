import { UserThrottlerGuard } from './user-throttler.guard';

describe('UserThrottlerGuard', () => {
	// getTracker doesn't touch the guard's injected dependencies.
	const guard = Object.create(UserThrottlerGuard.prototype) as {
		getTracker(req: Record<string, any>): Promise<string>;
	};

	it('keys an authenticated chronic-care request on sub', async () => {
		await expect(
			guard.getTracker({ ip: '1.1.1.1', user: { sub: 'p-1' } }),
		).resolves.toBe('user:p-1');
	});

	it('keys an authenticated Firebase request on uid', async () => {
		await expect(
			guard.getTracker({ ip: '1.1.1.1', user: { uid: 'u-1' } }),
		).resolves.toBe('user:u-1');
	});

	it('falls back to the client IP on public routes', async () => {
		await expect(guard.getTracker({ ip: '1.1.1.1' })).resolves.toBe(
			'ip:1.1.1.1',
		);
	});
});
