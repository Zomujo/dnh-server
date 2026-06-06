import { MessagesValue, ReducedValue, StateSchema } from '@langchain/langgraph';
import { z } from 'zod/v4';

export const PlannerStateSchema = new StateSchema({
	messages: MessagesValue,
	patient: z.object({
		id: z.string(),
		userId: z.string(),
	}),
	personnel: z.object({
		id: z.string(),
		userName: z.string(),
		role: z.string(),
	}),
	llmCalls: new ReducedValue(z.number().default(0), {
		reducer: (x, y) => x + y,
	}),
});

export type PlannerContext = { userId: string };
