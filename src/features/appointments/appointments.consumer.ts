import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Job } from 'bullmq';
import { Model } from 'mongoose';
import { PushNotificationType } from '@/features/notifications/dto';
import { PushService } from '@/features/notifications/push/push.service';
import { APPOINTMENT_REMINDER_QUEUE } from './appointments.constants';
import { AppointmentStatus } from './dto';
import { Appointment } from './entities/appointment.entity';

@Processor(APPOINTMENT_REMINDER_QUEUE)
export class AppointmentsConsumer extends WorkerHost {
	private logger = new Logger(AppointmentsConsumer.name);

	constructor(
		@InjectModel(Appointment.name)
		private readonly appointmentModel: Model<Appointment>,
		private readonly pushService: PushService,
	) {
		super();
	}

	async process(job: Job<{ appointmentId: string }, any, string>) {
		if (job.name !== 'remind') return;

		const appointment = await this.appointmentModel.findById(
			job.data.appointmentId,
		);

		if (!appointment) {
			this.logger.warn(
				`Appointment ${job.data.appointmentId} not found for reminder`,
			);
			return;
		}

		if (appointment.status === AppointmentStatus.CANCELLED) {
			return;
		}

		// The patient app opens Appointments for this type; the clinician's
		// copy keeps the generic type the HCP web app already handles.
		const getMessage = (notificationType: string) => () => ({
			notification: {
				title: 'Appointment Reminder',
				body: `Your appointment "${appointment.title}" is starting now.`,
			},
			data: {
				notification_type: notificationType,
				appointment_id: appointment._id.toString(),
				click_action: 'FLUTTER_NOTIFICATION_CLICK',
			},
		});

		if (appointment.userId) {
			this.pushService.sendNotification(
				getMessage(PushNotificationType.APPOINTMENT),
				appointment.userId,
			);
		}

		if (appointment.hostPersonnel) {
			this.pushService.sendNotification(
				getMessage('notification'),
				appointment.hostPersonnel.toString(),
			);
		}
	}
}
