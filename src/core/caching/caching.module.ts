import KeyvRedis from '@keyv/redis';
import { BullModule } from '@nestjs/bullmq';
import { CacheModule } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheService } from './caching.service';

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
	],
	providers: [
		CacheService,
		// {
		// 	provide: APP_INTERCEPTOR,
		// 	useClass: CustomCacheInterceptor,
		// },
	],
	exports: [CacheService],
})
export class CachingModule {}
