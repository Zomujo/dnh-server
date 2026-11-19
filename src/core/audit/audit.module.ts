import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';
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
export class AuditModule {}
