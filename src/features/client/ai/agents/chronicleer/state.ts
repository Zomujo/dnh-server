import { z } from 'zod';

export const SummarySchema = z.object({
	lang: z
		.string()
		.length(2)
		.describe(
			"Language code in ISO 639-1 format (e.g., 'en' for English, 'fr' for French)",
		),
	status: z
		.string()
		.describe("Short description of the patient's overall state or condition"),
	symptoms: z
		.array(z.string())
		.describe('List of reported symptoms mentioned by the patient'),
	risk: z
		.enum(['low', 'medium', 'high'])
		.describe("Risk level assessment based on the patient's current condition"),
	summary: z
		.string()
		.describe(
			'Brief 1–2 sentence summary of the conversation, focusing on key points',
		),
	actions: z
		.array(
			z.object({
				type: z
					.enum(['reminder', 'follow-up', 'escalation', 'other'])
					.describe('Type of action detected from the conversation'),
				details: z
					.string()
					.describe('Specific details of the action to be taken'),
			}),
		)
		.describe(
			'List of actions the system should take based on the conversation',
		),
});

export type AiInsights = z.infer<typeof SummarySchema>;
