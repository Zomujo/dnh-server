import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdherencesModule } from '@/features/adherences/adherences.module';
import { ChronicConditionsModule } from '@/features/chronic-conditions/chronic-conditions.module';
import { ConcernsModule } from '@/features/concerns/concerns.module';
import { MedicationsModule } from '@/features/medications/medications.module';
import { AugurNotificationsModule } from '@/features/notifications/notifications.module';
import { PatientsModule } from '@/features/patients/patients.module';
import { VitalHistoriesModule } from '@/features/vital-histories/vital-histories.module';
import { MemoryScribeService } from './agents/memory-scribe/memory-scribe.service';
import { ClientAIService } from './ai.service';
import { ExtClientAIService } from './ai-ext.service';
import { ClientAIChatService } from './client-ai-chat.service';
import { ClientAIChat, ClientAiChatSchema } from './entities/ai-chat.entity';

@Global()
@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: ClientAIChat.name, schema: ClientAiChatSchema },
		]),
		AdherencesModule,
		ChronicConditionsModule,
		ConcernsModule,
		MedicationsModule,
		AugurNotificationsModule,
		PatientsModule,
		VitalHistoriesModule,
	],
	providers: [
		ClientAIService,
		ExtClientAIService,
		MemoryScribeService,
		ClientAIChatService,
	],
	exports: [
		ClientAIService,
		ExtClientAIService,
		ClientAIChatService,
		AdherencesModule,
		ChronicConditionsModule,
		ConcernsModule,
		MedicationsModule,
		AugurNotificationsModule,
		PatientsModule,
		VitalHistoriesModule,
	],
})
export class AiModule {}
