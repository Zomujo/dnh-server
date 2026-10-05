import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
	Appointment,
	AppointmentSchema,
} from '@/features/appointments/entities/appointment.entity';
import { FacilitiesModule } from '@/features/facilities/facilities.module';
import {
	Patient,
	PatientSchema,
} from '@/features/patients/entities/patient.entity';
import { Personnel, PersonnelSchema } from '../entities/personnel.entity';
import { ChronicCareAuthController } from './chronic-care-auth.controller';
import { ChronicCareAuthService } from './chronic-care-auth.service';
import {
	PersonnelAccount,
	PersonnelAccountSchema,
} from './personnel-accounts/entities/personnel-account.entity';
import { PersonnelAccountsModule } from './personnel-accounts/personnel-accounts.module';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: Personnel.name, schema: PersonnelSchema },
			{ name: PersonnelAccount.name, schema: PersonnelAccountSchema },
			{ name: Appointment.name, schema: AppointmentSchema },
			{ name: Patient.name, schema: PatientSchema },
		]),
		PersonnelAccountsModule,
		FacilitiesModule,
	],
	controllers: [ChronicCareAuthController],
	providers: [ChronicCareAuthService],
})
export class ChronicCareAuthModule {}
