import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
	PlannerChat,
	PlannerChatSchema,
} from '../entities/planner-chat.entity';
import {
	PlannerSession,
	PlannerSessionSchema,
} from './entities/session.entity';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ name: PlannerSession.name, schema: PlannerSessionSchema },
			{ name: PlannerChat.name, schema: PlannerChatSchema },
		]),
	],
	controllers: [SessionsController],
	providers: [SessionsService],
	exports: [SessionsService],
})
export class SessionsModule {}
