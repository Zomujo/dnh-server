import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DomainLogger } from './logging.service';
import { TelemetryInterceptor } from './telemetry-interceptor';

@Module({
	providers: [
		DomainLogger,
		{
			provide: APP_INTERCEPTOR,
			useClass: TelemetryInterceptor,
		},
	],
	exports: [DomainLogger],
})
export class LoggingModule {}
