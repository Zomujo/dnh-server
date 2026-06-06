import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { CachingModule } from './caching/caching.module';
import { DatabaseModule } from './database/database.module';
import { FirebaseModule } from './firebase/firebase.module';
import { LoggingModule } from './logging/logging.module';

@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true }),
		EventEmitterModule.forRoot(),
		ScheduleModule.forRoot(),
		CachingModule,
		AuthModule,
		LoggingModule,
		FirebaseModule,
		DatabaseModule,
	],
})
export class CoreModule {}
