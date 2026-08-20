import { createClient, RedisClientType } from '@keyv/redis';
import {
	Injectable,
	Logger,
	OnModuleDestroy,
	OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerStorage } from '@nestjs/throttler';

// increment() must be atomic across concurrent requests hitting the same
// key, so the read-check-write is done as a single Lua script (EVAL)
// rather than separate round trips. Mirrors the in-memory
// ThrottlerStorageService's semantics: while a key is blocked its hit
// count is frozen (not incremented further), and the block is a separate
// key so it can outlive/outlast the hit-count window independently.
const INCREMENT_SCRIPT = `
local hitsKey = KEYS[1]
local blockKey = KEYS[2]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])

local blockPttl = redis.call('PTTL', blockKey)
if blockPttl > 0 then
	local totalHits = tonumber(redis.call('GET', hitsKey)) or limit
	return { totalHits, redis.call('PTTL', hitsKey), 1, blockPttl }
end

local totalHits = redis.call('INCR', hitsKey)
if totalHits == 1 then
	redis.call('PEXPIRE', hitsKey, ttl)
end
local hitsPttl = redis.call('PTTL', hitsKey)

if totalHits > limit then
	redis.call('SET', blockKey, 1, 'PX', blockDuration)
	return { totalHits, hitsPttl, 1, blockDuration }
end

return { totalHits, hitsPttl, 0, 0 }
`;

@Injectable()
export class RedisThrottlerStorage
	implements ThrottlerStorage, OnModuleInit, OnModuleDestroy
{
	private readonly logger = new Logger(RedisThrottlerStorage.name);
	private readonly client: RedisClientType;

	constructor(private readonly configService: ConfigService) {
		this.client = createClient({
			url: this.configService.get('REDIS_URL'),
		});
		this.client.on('error', (error) =>
			this.logger.error(
				`Redis throttler client error: ${error.message}`,
				error.stack,
			),
		);
	}

	async onModuleInit() {
		// Nest can invoke lifecycle hooks more than once on this instance
		// (it's shared across CachingModule and the RedisThrottlerStorageModule
		// pulled into ThrottlerModule.forRootAsync's `inject`), so connect()
		// must be idempotent rather than assumed to run exactly once.
		if (!this.client.isOpen) {
			await this.client.connect();
		}
	}

	async onModuleDestroy() {
		if (this.client.isOpen) {
			await this.client.quit();
		}
	}

	async increment(
		key: string,
		ttl: number,
		limit: number,
		blockDuration: number,
		throttlerName: string,
	) {
		const hitsKey = `throttle:${throttlerName}:${key}`;
		const blockKey = `throttle:block:${throttlerName}:${key}`;

		const [totalHits, timeToExpireMs, isBlocked, timeToBlockExpireMs] =
			(await this.client.eval(INCREMENT_SCRIPT, {
				keys: [hitsKey, blockKey],
				arguments: [String(ttl), String(limit), String(blockDuration)],
			})) as [number, number, number, number];

		return {
			totalHits,
			timeToExpire: Math.ceil(timeToExpireMs / 1000),
			isBlocked: isBlocked === 1,
			timeToBlockExpire: Math.ceil(timeToBlockExpireMs / 1000),
		};
	}
}
