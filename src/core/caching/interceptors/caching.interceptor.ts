import { CACHE_KEY_METADATA, CacheInterceptor } from '@nestjs/cache-manager';
import { ExecutionContext, Injectable, Logger } from '@nestjs/common';

@Injectable()
export class CustomCacheInterceptor extends CacheInterceptor {
	private logger = new Logger(CustomCacheInterceptor.name);

	protected trackBy(context: ExecutionContext): string | undefined {
		const httpAdapter = this.httpAdapterHost.httpAdapter;
		const isHttpApp = httpAdapter && !!httpAdapter.getRequestMethod;
		const cacheMetadata = this.reflector.get(
			CACHE_KEY_METADATA,
			context.getHandler(),
		);

		if (!isHttpApp || cacheMetadata) {
			return cacheMetadata;
		}

		const request = context.getArgByIndex(0);

		if (!this.isRequestCacheable(context)) {
			return undefined;
		}

		const protocol = request.protocol;
		const host = httpAdapter.getRequestHostname(request);
		const url = httpAdapter.getRequestUrl(request);
		const fullUrl = `${protocol}://${host}${url}`;

		const token = request.user ? request.user.sub : 'no-auth';

		return this.buildCacheKeyFrom(fullUrl, token || 'no-auth');
	}

	private buildCacheKeyFrom(fullUrl: string, token: string): string {
		try {
			const url = new URL(fullUrl);

			const normalizedPath = url.pathname
				.replace(/^\/api\/v1\//, '')
				.replace(/^\//, '')
				.replace(/\//g, ':');

			// Sort query parameters for consistency
			const params = Array.from(url.searchParams.entries()).sort();
			const queryString = params
				.map(([key, value]) => `${key}=${value}`)
				.join(':');

			// Include token (without Bearer) in the cache key
			return `token=${token}:${normalizedPath}${queryString ? `:${queryString}` : ''}`;
		} catch (error) {
			this.logger.error(`Invalid URL passed: ${error.message}`, error.stack);
			return '';
		}
	}
}
