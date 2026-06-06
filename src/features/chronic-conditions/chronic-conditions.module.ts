import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DhVectorsModule } from '../dh-vectors/dh-vectors.module';
// import { ChronicConditionsController } from './chronic-conditions.controller';
import { ChronicConditionsService } from './chronic-conditions.service';
import {
	ChronicCondition,
	ChronicConditionSchema,
} from './entities/chronic-condition.entity';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: ChronicCondition.name, schema: ChronicConditionSchema },
		]),
		DhVectorsModule,
	],
	// controllers: [ChronicConditionsController],
	providers: [ChronicConditionsService],
	exports: [ChronicConditionsService],
})
export class ChronicConditionsModule {}
