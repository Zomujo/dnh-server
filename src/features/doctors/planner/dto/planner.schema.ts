import { z } from 'zod';

// [
//   "AdherenceLog",
//   "AdherencePattern",
//   "ChronicCondition",
//   "Concern",
//   "Medication",
//   "AugurNotification",
//   "ChronicCareChat",
//   "VitalHistory",
//   "Patient",
//   "Referral",
//   "Personnel",
//   "Summary",
//   "PlannerSession",
//   "PlannerChat"
// ]
const DHCollectionsSchema = z.enum([
	'AdherenceLog',
	'AdherencePattern',
	'ChronicCondition',
	'Concern',
	'Medication',
	'AugurNotification',
	'ChronicCareChat',
	'VitalHistory',
	'Patient',
	'Referral',
	'Personnel',
	'Summary',
]);

export const CollectionDataSchema = z.object({
	name: DHCollectionsSchema.describe('The name of the collection to be viewed'),
});

export const PlannerQuerySchema = z.object({
	userId: z
		.string()
		.min(3)
		.max(50)
		.describe('User ID who raised the concern (3–50 characters)'),

	patient: z
		.string()
		.regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid Mongo ObjectId')
		.describe('Patient ID (MongoDB ObjectId) associated with this concern'),

	name: DHCollectionsSchema.describe('The name of the collection to be viewed'),

	aggregation: z
		.array(z.looseObject({}))
		.describe(
			'The aggregation query to be performed. ' +
				'IMPORTANT: The returned pipeline should be in the format of a mongodb aggregation pipeline. ' +
				'IMPORTANT: The match query you would write should not be a query of userId and patient. That is already being handled' +
				'Do not use the $oid operator.',
		),
});

export type PlannerQueryFilter = z.infer<typeof PlannerQuerySchema>;
export type CollectionData = z.infer<typeof CollectionDataSchema>;
