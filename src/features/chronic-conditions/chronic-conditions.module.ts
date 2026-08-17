import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DhVectorsModule } from '../dh-vectors/dh-vectors.module';
import { Patient, PatientSchema } from '../patients/entities/patient.entity';
import { ChronicConditionsService } from './chronic-conditions.service';
import {
	ChronicCondition,
	ChronicConditionSchema,
} from './entities/chronic-condition.entity';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: ChronicCondition.name, schema: ChronicConditionSchema },
			{ name: Patient.name, schema: PatientSchema },
		]),
		DhVectorsModule,
	],
	providers: [ChronicConditionsService],
	exports: [ChronicConditionsService],
})
export class ChronicConditionsModule {}
