import { Injectable, Logger } from '@nestjs/common';
import { PushService } from '@/features/notifications/push/push.service';
import { PatientsService } from '@/features/patients/patients.service';

@Injectable()
export class VigilSentinelService {
	private logger = new Logger(VigilSentinelService.name);

	constructor(
		private readonly patientsService: PatientsService,
		private readonly pushService: PushService,
	) {}

	async alertFacility(payload: { patientId: string; summary: string }) {
		try {
			const patient = await this.patientsService.findPatientById(
				payload.patientId,
				'facility name',
			);
			const facilityId = (patient as any)?.facility?.toString();

			if (!facilityId) {
				this.logger.warn('VigilSentinel alert has no facility to notify', {
					payload,
				});
				return;
			}

			this.pushService.sendNotificationToTopic(
				() => ({
					notification: {
						title: 'Patient Safety Alert',
						body: `${patient?.name ?? 'A patient'}: ${payload.summary}`,
					},
					data: {
						notification_type: 'notification',
						click_action: 'FLUTTER_NOTIFICATION_CLICK',
					},
				}),
				facilityId,
			);
		} catch (error) {
			this.logger.error('Error sending VigilSentinel facility alert', {
				payload,
				error,
			});
		}
	}
}
