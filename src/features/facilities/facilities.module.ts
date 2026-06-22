import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Facility, FacilitySchema } from './entities/facility.entity';
import { FacilitiesController } from './facilities.controller';
import { FacilitiesService } from './facilities.service';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ schema: FacilitySchema, name: Facility.name },
		]),
	],
	controllers: [FacilitiesController],
	providers: [FacilitiesService],
})
export class FacilitiesModule {}
