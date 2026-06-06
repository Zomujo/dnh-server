import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DhVectorsModule } from '../dh-vectors/dh-vectors.module';
// import { ConcernsController } from './concerns.controller';
import { ConcernsService } from './concerns.service';
import { Concern, ConcernSchema } from './entities/concern.entity';

@Module({
	imports: [
		MongooseModule.forFeature([{ name: Concern.name, schema: ConcernSchema }]),
		DhVectorsModule,
	],
	// controllers: [ConcernsController],
	providers: [ConcernsService],
	exports: [ConcernsService],
})
export class ConcernsModule {}
