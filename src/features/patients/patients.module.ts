import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChronicConditionsModule } from '../chronic-conditions/chronic-conditions.module';
import { DhVectorsModule } from '../dh-vectors/dh-vectors.module';
import {
	VitalHistory,
	VitalHistorySchema,
} from '../vital-histories/entities/vital-history.entity';
import { Patient, PatientSchema } from './entities/patient.entity';
import { Summary, SummarySchema } from './entities/summary.entity';
// import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: Patient.name, schema: PatientSchema },
			{ name: Summary.name, schema: SummarySchema },
			{ name: VitalHistory.name, schema: VitalHistorySchema },
		]),
		DhVectorsModule,
		ChronicConditionsModule,
	],
	// controllers: [PatientsController],
	providers: [PatientsService],
	exports: [PatientsService],
})
export class PatientsModule {}
