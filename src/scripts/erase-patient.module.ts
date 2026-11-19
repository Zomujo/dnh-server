import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthModule } from '../core/auth/auth.module';
import { CachingModule } from '../core/caching/caching.module';
import { DatabaseModule } from '../core/database/database.module';
import { FirebaseModule } from '../core/firebase/firebase.module';
import { ChatModule } from '../features/chat/chat.module';
import { ClientModule } from '../features/client/client.module';

/**
 * Only what ClientService.purgePatient needs, instead of the whole AppModule:
 * no HTTP layer, no cron (ScheduleModule), no USSD, staff or pharmacy
 * modules. ChatModule is here because it listens for the purge event and
 * deletes the patient's chat rooms; AuthModule only because ChatModule's
 * socket verifier injects AuthService (its guards never run without HTTP).
 * Queue workers in the imported modules are switched off by
 * disable-background-jobs.ts.
 */
@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true }),
		EventEmitterModule.forRoot(),
		CachingModule,
		AuthModule,
		FirebaseModule,
		DatabaseModule,
		ClientModule,
		ChatModule,
	],
})
export class ErasePatientModule {}
