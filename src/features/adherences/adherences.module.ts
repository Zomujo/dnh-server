import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DhVectorsModule } from '../dh-vectors/dh-vectors.module';
// import { AdherencesController } from './adherences.controller';
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
		]),
		DhVectorsModule,
	],
	// controllers: [AdherencesController],
	providers: [AdherencesService],
	exports: [AdherencesService],
})
export class AdherencesModule {}
