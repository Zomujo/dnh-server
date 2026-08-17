import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DhVectorsModule } from '../dh-vectors/dh-vectors.module';
import {
	Medication,
	MedicationSchema,
} from '../medications/entities/medication.entity';
import { Patient, PatientSchema } from '../patients/entities/patient.entity';
import { AdherencesService } from './adherences.service';
import {
	AdherenceLog,
	AdherenceLogSchema,
} from './entities/adherence-log.entity';
import {
	AdherencePattern,
	AdherencePatternSchema,
} from './entities/adherence-pattern.entity';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: AdherenceLog.name, schema: AdherenceLogSchema },
			{ name: AdherencePattern.name, schema: AdherencePatternSchema },
			{ name: Patient.name, schema: PatientSchema },
			// Registered here (not via MedicationsModule) to avoid a circular
			// module dependency — MedicationsModule already imports
			// AdherencesModule. Read-only access to the Medication schema is all
			// this module needs for dose-based adherence math.
			{ name: Medication.name, schema: MedicationSchema },
		]),
		DhVectorsModule,
	],
	providers: [AdherencesService],
	exports: [AdherencesService],
})
export class AdherencesModule {}
