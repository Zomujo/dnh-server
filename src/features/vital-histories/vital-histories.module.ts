import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PatientsModule } from '@/features/patients/patients.module';
import { DhVectorsModule } from '../dh-vectors/dh-vectors.module';
import {
	VitalHistory,
	VitalHistorySchema,
} from './entities/vital-history.entity';
import { VitalHistoriesController } from './vital-histories.controller';
import { VitalHistoriesService } from './vital-histories.service';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: VitalHistory.name, schema: VitalHistorySchema },
		]),
		DhVectorsModule,
		PatientsModule,
	],
	controllers: [VitalHistoriesController],
	providers: [VitalHistoriesService],
	exports: [VitalHistoriesService],
})
export class VitalHistoriesModule {}
