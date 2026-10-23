import { createClient, RedisClientType } from '@keyv/redis';
import {
	Injectable,
	Logger,
	OnModuleDestroy,
	OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type IdempotencyRecord =
	| { state: 'pending'; requestHash: string }
	| { state: 'done'; requestHash: string; status: number; body: unknown };

/**
 * Redis-backed records for Idempotency-Key handling. Needs SET NX, which
 * cache-manager doesn't expose, so it holds its own client (like
 * RedisThrottlerStorage).
 */
@Injectable()
export class IdempotencyStore implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(IdempotencyStore.name);
	private readonly client: RedisClientType;

	constructor(configService: ConfigService) {
		this.client = createClient({ url: configService.get('REDIS_URL') });
		this.client.on('error', (error) =>
			this.logger.error(`Redis idempotency client error: ${error.message}`),
		);
	}

	async onModuleInit() {
		// See RedisThrottlerStorage: lifecycle hooks may run more than once.
		if (!this.client.isOpen) {
			await this.client.connect();
		}
	}

	async onModuleDestroy() {
		if (this.client.isOpen) {
			await this.client.quit();
		}
	}

	/** Atomically claims `key`; false if a record already exists. */
	async acquire(key: string, record: IdempotencyRecord, ttlMs: number) {
		const result = await this.client.set(key, JSON.stringify(record), {
			condition: 'NX',
			expiration: { type: 'PX', value: ttlMs },
		});
		return result === 'OK';
	}

	async get(key: string): Promise<IdempotencyRecord | null> {
		const raw = await this.client.get(key);
		return raw ? (JSON.parse(raw) as IdempotencyRecord) : null;
	}

	async save(key: string, record: IdempotencyRecord, ttlMs: number) {
		await this.client.set(key, JSON.stringify(record), {
			expiration: { type: 'PX', value: ttlMs },
		});
	}

	async release(key: string) {
		await this.client.del(key);
	}
}
