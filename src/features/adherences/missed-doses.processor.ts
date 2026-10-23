import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { AdherencesService } from './adherences.service';

export const MISSED_DOSES_QUEUE = 'MissedDoses';

/**
 * Hourly: records a `missed` log for every dose left unconfirmed past its
 * confirm window (AdherencesService.recordMissedDoses). A BullMQ job
 * scheduler rather than an in-process cron, so it runs once per hour however
 * many server instances are up.
 */
@Processor(MISSED_DOSES_QUEUE)
export class MissedDosesProcessor extends WorkerHost implements OnModuleInit {
	private logger = new Logger(MissedDosesProcessor.name);

	constructor(
		private readonly adherencesService: AdherencesService,
		@InjectQueue(MISSED_DOSES_QUEUE) private readonly queue: Queue,
	) {
		super();
	}

	// A Redis hiccup at boot must not stop the API from starting. The
	// scheduler lives in Redis, so one registered by an earlier boot keeps
	// running.
	async onModuleInit() {
		try {
			await this.queue.upsertJobScheduler(
				'record-missed-doses',
				{ pattern: '5 * * * *' },
				{
					name: 'record',
					opts: {
						removeOnComplete: { count: 48 },
						removeOnFail: { age: 7 * 24 * 3600 },
					},
				},
			);
		} catch (error) {
			this.logger.error('Could not schedule the missed-dose job', error);
		}
	}

	async process() {
		const recorded = await this.adherencesService.recordMissedDoses();
		if (recorded > 0) {
			this.logger.log(`Recorded ${recorded} missed dose(s)`);
		}
		return { recorded };
	}
}
