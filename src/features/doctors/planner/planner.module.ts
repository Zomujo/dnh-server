import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PatientsModule } from '@/features/patients/patients.module';
import { DoctorsModule } from '../doctors.module';
import { PlannerChat, PlannerChatSchema } from './entities/planner-chat.entity';
// import { PlannerController } from './planner.controller';
import { PlannerService } from './planner.service';
import { PlannerAiService } from './planner-ai.service';
import { PlansModule } from './plans/plans.module';
import { SessionsModule } from './sessions/sessions.module';

@Module({
	// controllers: [PlannerController],
	providers: [PlannerService, PlannerAiService],
	imports: [
		SessionsModule,
		PlansModule,
		MongooseModule.forFeature([
			{ name: PlannerChat.name, schema: PlannerChatSchema },
		]),
		PatientsModule,
		forwardRef(() => DoctorsModule),
	],
})
export class PlannerModule {}
