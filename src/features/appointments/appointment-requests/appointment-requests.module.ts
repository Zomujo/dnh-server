import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppointmentRequestsController } from './appointment-requests.controller';
import { AppointmentRequestsService } from './appointment-requests.service';
import {
	AppointmentRequest,
	AppointmentRequestSchema,
} from './entities/appointment-request.entity';

@Module({
	imports: [
		MongooseModule.forFeature([
			{ schema: AppointmentRequestSchema, name: AppointmentRequest.name },
		]),
	],
	controllers: [AppointmentRequestsController],
	providers: [AppointmentRequestsService],
	exports: [AppointmentRequestsService],
})
export class AppointmentRequestsModule {}
