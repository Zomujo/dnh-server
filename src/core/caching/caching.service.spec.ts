import { CacheService } from './caching.service';

describe('CacheService.take', () => {
	const build = () => {
		// Same contract as a Keyv store: delete() reports whether it removed
		// the key, and only one concurrent caller can remove it.
		const map = new Map<string, unknown>();
		const store = {
			get: async (k: string) => map.get(k),
			set: async (k: string, v: unknown) => {
				map.set(k, v);
			},
			delete: async (k: string) => map.delete(k),
		};
		const cacheManager = {
			stores: [store],
			get: (k: string) => store.get(k),
			set: (k: string, v: unknown) => store.set(k, v),
			del: (k: string) => store.delete(k),
		};
		return { store, service: new CacheService<string>(cacheManager as any) };
	};

	it('returns the value once and removes it', async () => {
		const { store, service } = build();
		await store.set('k', 'v');

		await expect(service.take('k')).resolves.toBe('v');
		await expect(service.take('k')).resolves.toBeNull();
	});

	it('gives the value to only one of several concurrent callers', async () => {
		const { store, service } = build();
		await store.set('k', 'v');

		const results = await Promise.all([
			service.take('k'),
			service.take('k'),
			service.take('k'),
		]);
		expect(results.filter((r) => r === 'v')).toHaveLength(1);
	});
});
