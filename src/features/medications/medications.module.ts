import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdherencesModule } from '@/features/adherences/adherences.module';
import { DhVectorsModule } from '../dh-vectors/dh-vectors.module';
import { Medication, MedicationSchema } from './entities/medication.entity';
// import { MedicationsController } from './medications.controller';
import { MedicationsService } from './medications.service';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: Medication.name, schema: MedicationSchema },
		]),
		DhVectorsModule,
		AdherencesModule,
	],
	// controllers: [MedicationsController],
	providers: [MedicationsService],
	exports: [MedicationsService],
})
export class MedicationsModule {}
