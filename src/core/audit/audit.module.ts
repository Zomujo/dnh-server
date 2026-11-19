import {
	Global,
	MiddlewareConsumer,
	Module,
	NestModule,
	RequestMethod,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';
import { AuditDeniedMiddleware } from './audit-denied.middleware';
import { AuditLog, AuditLogSchema } from './entities/audit-log.entity';

@Global()
@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: AuditLog.name, schema: AuditLogSchema },
		]),
	],
	providers: [
		AuditService,
		{
			provide: APP_INTERCEPTOR,
			useClass: AuditInterceptor,
		},
	],
	exports: [AuditService],
})
export class AuditModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer
			.apply(AuditDeniedMiddleware)
			.forRoutes({ path: '{*splat}', method: RequestMethod.ALL });
	}
}
