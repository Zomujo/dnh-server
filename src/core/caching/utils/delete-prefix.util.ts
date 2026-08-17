import { createClient, RedisClientType } from '@keyv/redis';
import { Logger } from '@nestjs/common';

// Currently unused: this invalidates HTTP-response cache entries written
// under CustomCacheInterceptor's `token=...` key format (see
// caching.interceptor.ts), but that interceptor is not registered as
// APP_INTERCEPTOR (see caching.module.ts) so nothing ever writes those
// entries. It used to be called from ~15 entities' Mongoose post-save/
// post-update hooks on every write, which was pure overhead (scanning
// Redis for keys that could never exist) plus a correctness risk (see the
// note on error handling below). Those call sites were removed when 7.1
// was fixed. If CustomCacheInterceptor is ever re-enabled, this needs to
// be re-wired back into the relevant entities' hooks.
export async function deleteByPattern(redisUrl: string, pattern: string) {
	const logger = new Logger('Redis Pattern Delete');
	const client: RedisClientType = createClient({
		url: redisUrl,
	});

	try {
		await client.connect();

		let cursor = '0';

		do {
			const { cursor: nextCursor, keys } = await client.scan(cursor, {
				MATCH: pattern,
				COUNT: 100,
			});

			cursor = nextCursor;

			if (keys.length > 0) {
				const pipeline = client.multi();
				keys.forEach((key: string) => pipeline.del(key));
				await pipeline.exec();
			}
		} while (cursor !== '0');
	} catch (error) {
		// Deliberately not re-thrown: previously this call sat inside Mongoose
		// post-save/post-update hooks, so a transient Redis failure here (e.g.
		// during cache invalidation) would reject the hook chain and fail the
		// *originating database write*, even though that write had already
		// succeeded. Cache invalidation failing should never fail the write
		// it's invalidating on behalf of.
		logger.error(
			`Error deleting keys by pattern: ${error.message}`,
			error.stack,
		);
	} finally {
		await client.quit();
	}
}
