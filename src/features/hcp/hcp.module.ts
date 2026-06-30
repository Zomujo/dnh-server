import { Module } from '@nestjs/common';
import { AdherencesModule } from '../adherences/adherences.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { MedicationsModule } from '../medications/medications.module';
import { PatientsModule } from '../patients/patients.module';
import { VitalHistoriesModule } from '../vital-histories/vital-histories.module';
import { HcpController } from './hcp.controller';
import { HcpService } from './hcp.service';

@Module({
	imports: [
		PatientsModule,
		MedicationsModule,
		AdherencesModule,
		VitalHistoriesModule,
		AppointmentsModule,
	],
	controllers: [HcpController],
	providers: [HcpService],
})
export class HcpModule {}
