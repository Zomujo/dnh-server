import { ThrottlerException } from '@nestjs/throttler';
import { type Mocked, TestBed } from '@suites/unit';
import * as bcrypt from 'bcrypt';
import { AttemptLimiter } from '../../caching/attempt-limiter';
import { CacheService } from '../../caching/caching.service';
import { OtpService } from './otp.service';

describe('OtpService', () => {
	let service: OtpService;
	let cache: Mocked<CacheService<string>>;
	let store: Map<string, string>;
	let limiter: Mocked<AttemptLimiter>;

	beforeEach(async () => {
		const { unit, unitRef } = await TestBed.solitary(OtpService).compile();
		service = unit;
		cache = unitRef.get(CacheService);
		limiter = unitRef.get(AttemptLimiter);
		store = new Map();
		cache.set.mockImplementation(async (k: string, v: string) => {
			store.set(k, v);
		});
		cache.get.mockImplementation(async (k: string) => store.get(k) ?? null);
		cache.take.mockImplementation(async (k: string) => {
			const v = store.get(k) ?? null;
			return store.delete(k) ? v : null;
		});
	});

	it('refuses a new code once the address hit its send limit', async () => {
		limiter.assertAllowed.mockRejectedValue(new ThrottlerException());

		await expect(
			service.generate({ identifier: 'A@example.com' }),
		).rejects.toThrow(ThrottlerException);
		expect(store.size).toBe(0);
		expect(limiter.assertAllowed).toHaveBeenCalledWith(
			expect.objectContaining({ name: 'otp-send' }),
			'a@example.com',
		);
	});

	it('accepts the generated code once', async () => {
		const code = await service.generate({ identifier: 'a@example.com' });

		await expect(
			service.verify({ identifier: 'a@example.com', code }),
		).resolves.toBe(true);
		await expect(
			service.verify({ identifier: 'a@example.com', code }),
		).resolves.toBe(false);
	});

	it('burns the code on a wrong guess', async () => {
		const code = await service.generate({ identifier: 'a@example.com' });
		const wrong = code === 999999 ? 100000 : code + 1;

		await expect(
			service.verify({ identifier: 'a@example.com', code: wrong }),
		).resolves.toBe(false);
		await expect(
			service.verify({ identifier: 'a@example.com', code }),
		).resolves.toBe(false);
	});

	it('treats glob characters in the identifier literally', async () => {
		store.set('otp:victim@example.com', await bcrypt.hash('123456', 4));

		await expect(
			service.verify({ identifier: '*@example.com', code: 123456 }),
		).resolves.toBe(false);
		expect(cache.take).toHaveBeenCalledWith('otp:*@example.com');
		expect(store.has('otp:victim@example.com')).toBe(true);
	});
});
