import { Module } from '@nestjs/common';
import { RedisThrottlerStorage } from './throttler-redis.storage';

// Separated from CachingModule so it can be listed in
// ThrottlerModule.forRootAsync's `imports`, making RedisThrottlerStorage
// resolvable by that factory's `inject` array.
@Module({
	providers: [RedisThrottlerStorage],
	exports: [RedisThrottlerStorage],
})
export class RedisThrottlerStorageModule {}
