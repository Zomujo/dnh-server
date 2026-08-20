import KeyvRedis from '@keyv/redis';
import { BullModule } from '@nestjs/bullmq';
import { CacheModule } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { seconds, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CacheService } from './caching.service';
import { RedisThrottlerStorage } from './throttler-redis.storage';
import { RedisThrottlerStorageModule } from './throttler-redis-storage.module';

@Global()
@Module({
	imports: [
		CacheModule.registerAsync({
			isGlobal: true,
			imports: [ConfigModule],
			useFactory: async (configService: ConfigService) => ({
				stores: [new KeyvRedis(configService.get('REDIS_URL'))],
				ttl: 1000 * 60 * 5, //5mins
			}),
			inject: [ConfigService],
		}),
		BullModule.forRootAsync({
			imports: [ConfigModule],
			useFactory: async (configService: ConfigService) => ({
				connection: {
					family: 0,
					url: configService.get('REDIS_URL'),
					tls: configService.get<boolean>('QUEUE_TLS'),
				},
			}),
			inject: [ConfigService],
		}),
		ThrottlerModule.forRootAsync({
			imports: [RedisThrottlerStorageModule],
			useFactory: async (storage: RedisThrottlerStorage) => ({
				throttlers: [{ ttl: seconds(60), limit: 100 }],
				storage,
			}),
			inject: [RedisThrottlerStorage],
		}),
	],
	providers: [
		CacheService,
		{
			provide: APP_GUARD,
			useClass: ThrottlerGuard,
		},
		// CustomCacheInterceptor (src/core/caching/interceptors/caching.interceptor.ts)
		// is intentionally NOT registered. It builds per-user, per-route cache
		// keys (`token=<userId>:<path>...`) but was never actually wired up as
		// APP_INTERCEPTOR, so no HTTP response has ever been cached under that
		// key format — meanwhile ~15 entities were unconditionally scanning
		// Redis for (and re-throwing on failure to delete) keys matching that
		// same format on every single write, for zero benefit. Those
		// now-pointless invalidation calls were removed when audit item 7.1
		// was fixed; see delete-prefix.util.ts for the invalidation helper,
		// still present and ready to be reused.
		//
		// To actually enable response caching: uncomment the block below,
		// AND re-add deleteByPattern(...) calls to the relevant entities'
		// Mongoose post-save/post-update hooks so cached responses get
		// invalidated on writes (see git history prior to the 7.1 fix for
		// the exact patterns/key formats that were in place).
		// {
		// 	provide: APP_INTERCEPTOR,
		// 	useClass: CustomCacheInterceptor,
		// },
	],
	exports: [CacheService],
})
export class CachingModule {}
