import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdherencesModule } from '@/features/adherences/adherences.module';
import { AugurNotificationsModule } from '@/features/notifications/notifications.module';
import { DhVectorsModule } from '../dh-vectors/dh-vectors.module';
import { Medication, MedicationSchema } from './entities/medication.entity';
import { MedicationsService } from './medications.service';
import { SeededMedsModule } from './seeded-meds/seeded-meds.module';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: Medication.name, schema: MedicationSchema },
		]),
		DhVectorsModule,
		AdherencesModule,
		AugurNotificationsModule,
		SeededMedsModule,
	],
	providers: [MedicationsService],
	exports: [MedicationsService, SeededMedsModule],
})
export class MedicationsModule {}
