import { TargetType } from './adherence-log.dto';

export interface AdherenceInsights {
	overview: OverviewInsights;

	byTargetType: Record<TargetType, TargetTypeInsights>;
}

export interface OverviewInsights {
	totalLogs: number;
	totalTaken: number;
	totalMissed: number;
	totalPartial: number;
	overallAdherenceRate: number;
	currentStreak: number;
	longestStreak: number;
}

export interface TargetTypeInsights {
	totalLogs: number;
	totalTaken: number;
	totalMissed: number;
	adherenceRate: number;

	bestTarget?: string;
	worstTarget?: string;

	byTarget: Record<string, TargetInsights>;
}

export interface TargetInsights {
	totalLogs: number;
	takenCount: number;
	missedCount: number;
	partialCount: number;

	adherenceRate: number;

	currentStreak: number;
	longestStreak: number;

	firstLogDate: Date;
	lastLogDate: Date;
	lastTakenAt?: Date;
	lastMissedAt?: Date;
}
