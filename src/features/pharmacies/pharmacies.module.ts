import { Module } from '@nestjs/common';
import { DoctorsModule } from '../doctors/doctors.module';
import { VitalHistoriesModule } from '../vital-histories/vital-histories.module';
// import { PharmaciesController } from './pharmacies.controller';
import { PharmaciesService } from './pharmacies.service';

@Module({
	imports: [VitalHistoriesModule, DoctorsModule],
	// controllers: [PharmaciesController],
	providers: [PharmaciesService],
})
export class PharmaciesModule {}
