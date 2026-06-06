import { createClient, RedisClientType } from '@keyv/redis';
import { Logger } from '@nestjs/common';

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
		logger.error(
			`Error deleting keys by pattern: ${error.message}`,
			error.stack,
		);
		throw error;
	} finally {
		await client.quit();
	}
}
