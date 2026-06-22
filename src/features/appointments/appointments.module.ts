import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PatientsModule } from '@/features/patients/patients.module';
import { AppointmentRequestsModule } from './appointment-requests/appointment-requests.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { Appointment, AppointmentSchema } from './entities/appointment.entity';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ schema: AppointmentSchema, name: Appointment.name },
		]),
		AppointmentRequestsModule,
		PatientsModule,
	],
	controllers: [AppointmentsController],
	providers: [AppointmentsService],
	exports: [AppointmentsService, AppointmentRequestsModule],
})
export class AppointmentsModule {}
