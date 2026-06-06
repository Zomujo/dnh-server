import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChronicCareAuthModule } from './auth/chronic-care-auth.module';
import { DoctorsController } from './doctors.controller';
import { DoctorsService } from './doctors.service';
import { Personnel, PersonnelSchema } from './entities/personnel.entity';
import { PlannerModule } from './planner/planner.module';

@Module({
	imports: [
		ChronicCareAuthModule,
		MongooseModule.forFeature([
			{ name: Personnel.name, schema: PersonnelSchema },
		]),
		forwardRef(() => PlannerModule),
	],
	providers: [DoctorsService],
	controllers: [DoctorsController],
	exports: [DoctorsService],
})
export class DoctorsModule {}
