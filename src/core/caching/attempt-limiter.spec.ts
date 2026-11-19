import { ThrottlerException } from '@nestjs/throttler';
import { type Mocked, TestBed } from '@suites/unit';
import { AttemptLimit, AttemptLimiter } from './attempt-limiter';
import { RedisThrottlerStorage } from './throttler-redis.storage';

const LIMIT: AttemptLimit = {
	name: 'test',
	max: 3,
	windowMs: 60_000,
	blockMs: 120_000,
};

describe('AttemptLimiter', () => {
	let limiter: AttemptLimiter;
	let storage: Mocked<RedisThrottlerStorage>;
	let hits: Map<string, number>;
	let blocked: Set<string>;

	beforeEach(async () => {
		const { unit, unitRef } = await TestBed.solitary(AttemptLimiter).compile();
		limiter = unit;
		storage = unitRef.get(RedisThrottlerStorage);
		hits = new Map();
		blocked = new Set();
		// Same rule as the Lua script: block once hits exceed the limit.
		storage.increment.mockImplementation(
			async (key, _ttl, limit, blockMs, name) => {
				const k = `${name}:${key}`;
				const total = (hits.get(k) ?? 0) + 1;
				hits.set(k, total);
				if (total > limit) blocked.add(k);
				const isBlocked = blocked.has(k);
				return {
					totalHits: total,
					timeToExpire: 60,
					isBlocked,
					timeToBlockExpire: isBlocked ? blockMs / 1000 : 0,
				};
			},
		);
		storage.reset.mockImplementation(async (key, name) => {
			hits.delete(`${name}:${key}`);
			blocked.delete(`${name}:${key}`);
		});
	});

	it('allows max attempts and refuses the next', async () => {
		for (let i = 0; i < 3; i++) {
			await expect(limiter.consume(LIMIT, 'a')).resolves.toBeUndefined();
		}
		await expect(limiter.consume(LIMIT, 'a')).rejects.toThrow(
			ThrottlerException,
		);
		expect(storage.increment).toHaveBeenCalledWith(
			'a',
			60_000,
			3,
			120_000,
			'test',
		);
	});

	it('keeps subjects apart', async () => {
		for (let i = 0; i < 3; i++) await limiter.consume(LIMIT, 'a');
		await expect(limiter.consume(LIMIT, 'b')).resolves.toBeUndefined();
	});

	it('reset clears the count and the block', async () => {
		for (let i = 0; i < 3; i++) await limiter.consume(LIMIT, 'a');
		await expect(limiter.consume(LIMIT, 'a')).rejects.toThrow();
		await limiter.reset(LIMIT, 'a');
		await expect(limiter.consume(LIMIT, 'a')).resolves.toBeUndefined();
	});

	it('says how long to wait', async () => {
		for (let i = 0; i < 3; i++) await limiter.consume(LIMIT, 'a');
		await expect(limiter.consume(LIMIT, 'a')).rejects.toThrow(
			'Try again in 2 minutes',
		);
	});
});
