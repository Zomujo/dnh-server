import { ConcernTypes } from './concern.dto';

export interface ConcernInsights {
	overview: ConcernOverview;

	byType: Partial<Record<ConcernTypes, ConcernTypeInsights>>;

	trends?: {
		weekly: Record<string, number>; // ISO week → count
		monthly: Record<string, number>; // YYYY-MM → count
	};
}

export interface ConcernOverview {
	totalConcerns: number;
	activeConcerns: number;
	resolvedConcerns: number;

	severeCount: number;
	moderateCount: number;
	mildCount: number;

	mostCommonType?: ConcernTypes;

	averageResolutionTimeDays?: number;
}

export interface ConcernTypeInsights {
	total: number;
	active: number;
	resolved: number;

	severeCount: number;

	resolutionRate: number; // %
	averageResolutionTimeDays?: number;

	mostRecentOnset?: Date;
}
