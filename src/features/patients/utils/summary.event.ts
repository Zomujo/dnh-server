import { EventEmitter } from 'node:events';
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
export const myEmitter = new MyEmitter();

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
