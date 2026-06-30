import { Module } from '@nestjs/common';
import { AdherencesModule } from './adherences/adherences.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { ChronicConditionsModule } from './chronic-conditions/chronic-conditions.module';
import { ClientModule } from './client/client.module';
import { ConcernsModule } from './concerns/concerns.module';
import { DhVectorsModule } from './dh-vectors/dh-vectors.module';
import { DoctorsModule } from './doctors/doctors.module';
import { FacilitiesModule } from './facilities/facilities.module';
import { HcpModule } from './hcp/hcp.module';
import { MedicationsModule } from './medications/medications.module';
import { AugurNotificationsModule } from './notifications/notifications.module';
import { PatientsModule } from './patients/patients.module';
import { PharmaciesModule } from './pharmacies/pharmacies.module';
import { VitalHistoriesModule } from './vital-histories/vital-histories.module';

@Module({
	imports: [
		AdherencesModule,
		ChronicConditionsModule,
		ClientModule,
		ConcernsModule,
		DhVectorsModule,
		DoctorsModule,
		MedicationsModule,
		AugurNotificationsModule,
		PatientsModule,
		PharmaciesModule,
		VitalHistoriesModule,
		AppointmentsModule,
		FacilitiesModule,
		HcpModule,
	],
})
export class FeaturesModule {}
