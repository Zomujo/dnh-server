import { type Mocked, TestBed } from '@suites/unit';
import * as bcrypt from 'bcrypt';
import { CacheService } from '../../caching/caching.service';
import { OtpService } from './otp.service';

describe('OtpService', () => {
	let service: OtpService;
	let cache: Mocked<CacheService<string>>;
	let store: Map<string, string>;

	beforeEach(async () => {
		const { unit, unitRef } = await TestBed.solitary(OtpService).compile();
		service = unit;
		cache = unitRef.get(CacheService);
		store = new Map();
		cache.set.mockImplementation(async (k: string, v: string) => {
			store.set(k, v);
		});
		cache.get.mockImplementation(async (k: string) => store.get(k) ?? null);
		cache.delete.mockImplementation(async (k: string) => store.delete(k));
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
		expect(cache.get).toHaveBeenCalledWith('otp:*@example.com');
		expect(store.has('otp:victim@example.com')).toBe(true);
	});
});
