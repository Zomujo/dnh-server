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
}
