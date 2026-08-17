import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DhVectorsModule } from '../dh-vectors/dh-vectors.module';
import { PatientsModule } from '../patients/patients.module';
import { ConcernsService } from './concerns.service';
import { Concern, ConcernSchema } from './entities/concern.entity';

@Module({
	imports: [
		MongooseModule.forFeature([{ name: Concern.name, schema: ConcernSchema }]),
		DhVectorsModule,
		PatientsModule,
	],
	providers: [ConcernsService],
	exports: [ConcernsService],
})
export class ConcernsModule {}
