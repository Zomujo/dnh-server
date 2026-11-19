import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';

@Injectable()
export class CacheService<T> {
	constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

	async get(key: string): Promise<T | null> {
		const value = await this.cacheManager.get(key);
		if (!value) {
			return null;
		}
		return value as T;
	}

	async set(key: string, value: T, ttl?: number) {
		const response = (await this.cacheManager.set(key, value, ttl)) as T;
		return response;
	}

	async delete(key: string) {
		const response = await this.cacheManager.del(key);
		return response;
	}

	/**
	 * Reads a value and deletes it, returning it only to the caller whose
	 * delete removed the key. Redis DEL is atomic, so of several concurrent
	 * callers exactly one gets the value. cache-manager's own del() always
	 * reports true, so this asks the underlying Keyv stores directly.
	 */
	async take(key: string): Promise<T | null> {
		const value = await this.get(key);
		if (value === null) {
			return null;
		}
		const removed = await Promise.all(
			this.cacheManager.stores.map((store) => store.delete(key)),
		);
		return removed.some(Boolean) ? value : null;
	}
}
