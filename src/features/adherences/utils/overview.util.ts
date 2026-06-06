import { PromptTemplate } from '@langchain/core/prompts';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { Model } from 'mongoose';
import { AdherenceLog, TargetType } from '../entities/adherence-log.entity';
import {
	AdherencePattern,
	PatternTargetType,
} from '../entities/adherence-pattern.entity';
import { ADHERENCE_OVERVIEW_NOTE_PROMPT } from './adherence-note-prompt.util';

export async function upsertOverallAdherencePattern(
	log: AdherenceLog,
	adherenceLogModel: Model<AdherenceLog>,
	adherencePatternModel: Model<AdherencePattern>,
) {
	const adherenceLogs = await adherenceLogModel
		.find({
			userId: log.userId,
			patient: log.patient,
			targetType: { $ne: 'overview' as TargetType },
		})
		.sort({ takenAt: -1 })
		.limit(14)
		.select('targetType targetName takenAt taken')
		.exec();

	const daysTaken = adherenceLogs.filter((log) => log.taken).length;
	const totalLogs = adherenceLogs.length;
	const adherenceRate = totalLogs > 0 ? (daysTaken / totalLogs) * 100 : 100;

	const notes = await patternNotes(adherenceLogs);
	await adherencePatternModel.findOneAndUpdate(
		{
			userId: log.userId,
			patient: log.patient,
			targetType: PatternTargetType.OVERVIEW,
			targetName: 'Overview',
		},
		{
			userId: log.userId,
			patient: log.patient,
			targetType: PatternTargetType.OVERVIEW,
			targetName: 'Overview',
			adherenceRate: adherenceRate || 0,
			lastLoggedAt: log.takenAt,
			notes,
		},
		{ upsert: true, returnDocument: 'after' },
	);
}

async function patternNotes(adherenceLogs: AdherenceLog[]) {
	const llm = new ChatGoogleGenerativeAI({
		model: process.env.GOOGLE_AI_VERSION ?? 'gemini-2.5-flash',
		temperature: 0.7,
	});

	const promptTemplate = PromptTemplate.fromTemplate(
		ADHERENCE_OVERVIEW_NOTE_PROMPT,
	);

	const prompt = await promptTemplate.invoke({
		adherenceLogs: JSON.stringify(adherenceLogs),
	});

	const output = await llm.invoke(prompt);
	return output.content as string;
}
