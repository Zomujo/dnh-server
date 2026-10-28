import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { AdherencesService } from './adherences.service';

export const MISSED_DOSES_QUEUE = 'MissedDoses';

/**
 * Hourly: records a `missed` log for every dose left unconfirmed past its
 * confirm window (AdherencesService.recordMissedDoses). Daily, just after
 * midnight: refreshes every patient's clinician-facing rate, so the day
 * that ended counts (AdherencesService.refreshAdherenceRates). BullMQ job
 * schedulers rather than in-process crons, so each runs once however many
 * server instances are up.
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
	// schedulers live in Redis, so ones registered by an earlier boot keep
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
			// 00:15 in the process zone (Africa/Accra, see set-time-zone.ts).
			await this.queue.upsertJobScheduler(
				'refresh-adherence-rates',
				{ pattern: '15 0 * * *' },
				{
					name: 'refresh-rates',
					opts: {
						removeOnComplete: { count: 7 },
						removeOnFail: { age: 7 * 24 * 3600 },
					},
				},
			);
		} catch (error) {
			this.logger.error('Could not schedule the adherence jobs', error);
		}
	}

	async process(job: Job) {
		if (job.name === 'refresh-rates') {
			const refreshed = await this.adherencesService.refreshAdherenceRates();
			this.logger.log(
				`Refreshed the adherence rate of ${refreshed} patient(s)`,
			);
			return { refreshed };
		}

		const recorded = await this.adherencesService.recordMissedDoses();
		if (recorded > 0) {
			this.logger.log(`Recorded ${recorded} missed dose(s)`);
		}
		return { recorded };
	}
}
