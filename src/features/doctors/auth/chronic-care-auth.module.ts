import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Personnel, PersonnelSchema } from '../entities/personnel.entity';
import { ChronicCareAuthController } from './chronic-care-auth.controller';
import { ChronicCareAuthService } from './chronic-care-auth.service';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: Personnel.name, schema: PersonnelSchema },
		]),
	],
	controllers: [ChronicCareAuthController],
	providers: [ChronicCareAuthService],
})
export class ChronicCareAuthModule {}
