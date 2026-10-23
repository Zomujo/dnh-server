import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { AugurNotification } from '../../notifications/entities/notification.entity';
import { Summary } from '../entities/summary.entity';
import {
	Sections,
	SummaryModels,
	UserData,
	upsertSummary,
} from './summary.util';

export class MyEmitter extends EventEmitter {}

// The listeners here (and in adherence-log.entity.ts) are async and run
// after the request has been answered. captureRejections turns a failed one
// (e.g. a Gemini error while writing notes) into an 'error' event, logged
// below, instead of an unhandled rejection, which ends the Node process.
export const myEmitter = new MyEmitter({ captureRejections: true });

const logger = new Logger('SummaryEvents');
myEmitter.on('error', (error) => {
	logger.error('Background summary/adherence update failed', error);
});

myEmitter.on(
	'upsertSummary',

	async (
		section: Sections,
		models: SummaryModels,
		userData: UserData,
		summaryModel: Model<Summary>,
		notificationModel?: Model<AugurNotification>,
	) => {
		await upsertSummary(
			section,
			models,
			userData,
			summaryModel,
			notificationModel,
		);
	},
);
