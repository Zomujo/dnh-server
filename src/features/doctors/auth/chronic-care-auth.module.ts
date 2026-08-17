import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FacilitiesModule } from '@/features/facilities/facilities.module';
import { Personnel, PersonnelSchema } from '../entities/personnel.entity';
import { ChronicCareAuthController } from './chronic-care-auth.controller';
import { ChronicCareAuthService } from './chronic-care-auth.service';
import {
	PersonnelAccount,
	PersonnelAccountSchema,
} from './personnel-accounts/entities/personnel-account.entity';
import { PersonnelAccountsModule } from './personnel-accounts/personnel-accounts.module';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: Personnel.name, schema: PersonnelSchema },
			{ name: PersonnelAccount.name, schema: PersonnelAccountSchema },
		]),
		PersonnelAccountsModule,
		FacilitiesModule,
	],
	controllers: [ChronicCareAuthController],
	providers: [ChronicCareAuthService],
})
export class ChronicCareAuthModule {}
