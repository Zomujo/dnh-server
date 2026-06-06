import { Module } from '@nestjs/common';
import { AdherencesModule } from '../adherences/adherences.module';
import { ChronicConditionsModule } from '../chronic-conditions/chronic-conditions.module';
import { ConcernsModule } from '../concerns/concerns.module';
import { DhVectorsModule } from '../dh-vectors/dh-vectors.module';
import { MedicationsModule } from '../medications/medications.module';
import { PatientsModule } from '../patients/patients.module';
import { VitalHistoriesModule } from '../vital-histories/vital-histories.module';
import { AiModule } from './ai/ai.module';
import { ClientController } from './client.controller';
import { ClientService } from './client.service';

@Module({
	controllers: [ClientController],
	providers: [ClientService],
	imports: [
		AiModule,
		DhVectorsModule,
		PatientsModule,
		ChronicConditionsModule,
		MedicationsModule,
		ConcernsModule,
		AdherencesModule,
		VitalHistoriesModule,
	],
})
export class ClientModule {}
