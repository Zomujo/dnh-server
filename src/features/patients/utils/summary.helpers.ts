import { addMonths } from 'date-fns';
import { Model, Types } from 'mongoose';
import { AdherenceLog } from '@/features/adherences/entities/adherence-log.entity';
import { ChronicCondition } from '@/features/chronic-conditions/entities/chronic-condition.entity';
import { Concern } from '@/features/concerns/entities/concern.entity';
import { Medication } from '@/features/medications/entities/medication.entity';
import { VitalHistoryBody, VitalTypes } from '@/features/vital-histories/dto';
import { VitalHistory } from '@/features/vital-histories/entities/vital-history.entity';
import { AdherenceInsights } from '../../adherences/dto';
import {
	ConcernInsights,
	ConcernTypeInsights,
	ConcernTypes,
} from '../../concerns/dto';
import { Frequency, NotificationType } from '../../notifications/dto';
import { AugurNotification } from '../../notifications/entities/notification.entity';
import { VitalSeverityEnum } from '../../vital-histories/entities/vital-history.entity';

export async function upsertChronicCondition(
	chronicCondition: { data: ChronicCondition; model: Model<ChronicCondition> },
	chronicConditionSummary: Record<string, { status: string; notes: string }>,
): Promise<Record<string, { status: string; notes: string }>> {
	const { data, model } = chronicCondition;

	if (!data._id) {
		return chronicConditionSummary;
	}

	const updatedSummary = { ...chronicConditionSummary };

	const cCond = await model.findById(data._id).select('status notes');
	if (!cCond) {
		return chronicConditionSummary;
	}

	updatedSummary[cCond.conditionName] = {
		status: cCond.currentStatus,
		notes: cCond.notes || '',
	};

	return updatedSummary;
}

export async function upsertMedication(
	medication: { data: Medication; model: Model<Medication> },
	medicationSummary: Record<
		string,
		{ frequency: Frequency; totalExpectedCount: number }
	>,
	patientId: string,
	notificatonModel: Model<AugurNotification>,
): Promise<Record<string, { frequency: any; totalExpectedCount: number }>> {
	const { data, model } = medication;

	if (!data._id) {
		return medicationSummary;
	}

	const updatedSummary = { ...medicationSummary };
	const med = await model.findById(data._id).select('name');
	if (!med) {
		return medicationSummary;
	}

	const existingRecord = updatedSummary[med.name];

	const notification = await notificatonModel
		.findOne({
			patient: patientId as any,
			targetType: 'medication',
			targetName: med.name,
			notificationType: NotificationType.REMINDER,
		})
		.select('frequency');

	if (!notification) {
		return updatedSummary;
	}

	updatedSummary[med.name] = {
		frequency: notification.frequency,
		totalExpectedCount: (existingRecord?.totalExpectedCount || 0) + 1,
	};

	return updatedSummary;
}

export async function getConcernInsights(
	patientId: string,
	model: Model<Concern>,
): Promise<ConcernInsights> {
	const pId = new Types.ObjectId(patientId);

	const results = await model.aggregate([
		{ $match: { patient: pId } },
		{
			$facet: {
				// 1. Calculate Global Overview & Type breakdown
				totals: [
					{
						$group: {
							_id: '$concernType',
							count: { $sum: 1 },
							active: {
								$sum: { $cond: [{ $eq: ['$resolved', false] }, 1, 0] },
							},
							resolved: {
								$sum: { $cond: [{ $eq: ['$resolved', true] }, 1, 0] },
							},
							severe: {
								$sum: { $cond: [{ $eq: ['$severity', 'severe'] }, 1, 0] },
							},
							moderate: {
								$sum: { $cond: [{ $eq: ['$severity', 'moderate'] }, 1, 0] },
							},
							mild: { $sum: { $cond: [{ $eq: ['$severity', 'mild'] }, 1, 0] } },
							latestOnset: { $max: '$onsetDate' },
						},
					},
				],
				// 2. Weekly Trends
				weeklyTrends: [
					{
						$group: {
							_id: { $dateToString: { format: '%G-W%V', date: '$onsetDate' } },
							count: { $sum: 1 },
						},
					},
				],
				// 3. Monthly Trends
				monthlyTrends: [
					{
						$group: {
							_id: { $dateToString: { format: '%Y-%m', date: '$onsetDate' } },
							count: { $sum: 1 },
						},
					},
				],
			},
		},
	]);

	const data = results[0];
	const byType: Partial<Record<ConcernTypes, ConcernTypeInsights>> = {};

	let totalConcerns = 0;
	let activeConcerns = 0;
	let resolvedConcerns = 0;
	let severeCount = 0;
	let moderateCount = 0;
	let mildCount = 0;
	let topType: ConcernTypes | undefined;
	let maxCount = 0;

	// Process Type-based data
	data.totals.forEach((group: any) => {
		const type = group._id as ConcernTypes;
		const total = group.count;

		// Update Global Stats
		totalConcerns += total;
		activeConcerns += group.active;
		resolvedConcerns += group.resolved;
		severeCount += group.severe;
		moderateCount += group.moderate;
		mildCount += group.mild;

		if (total > maxCount) {
			maxCount = total;
			topType = type;
		}

		// Build Type-specific Insights
		byType[type] = {
			total,
			active: group.active,
			resolved: group.resolved,
			severeCount: group.severe,
			resolutionRate: total > 0 ? (group.resolved / total) * 100 : 0,
			mostRecentOnset: group.latestOnset,
		};
	});

	return {
		overview: {
			totalConcerns,
			activeConcerns,
			resolvedConcerns,
			severeCount,
			moderateCount,
			mildCount,
			mostCommonType: topType,
		},
		byType,
		trends: {
			weekly: Object.fromEntries(
				data.weeklyTrends.map((t: any) => [t._id, t.count]),
			),
			monthly: Object.fromEntries(
				data.monthlyTrends.map((t: any) => [t._id, t.count]),
			),
		},
	};
}

export function upsertVitalHistories(
	vitalHistory: { data: VitalHistory; model: Model<VitalHistory> },
	vitalHistorySummary: Record<VitalTypes, VitalHistoryBody>,
): Record<VitalTypes, VitalHistoryBody> {
	const { data } = vitalHistory;
	const type = data.vitalType as VitalTypes;

	// 1. Guard clause: Ensure the type is valid within our enum
	if (!Object.values(VitalTypes).includes(type)) {
		return vitalHistorySummary;
	}

	const updatedSummary = { ...vitalHistorySummary };
	const existing = updatedSummary[type] || {
		totalCount: 0,
		totalSystolic: 0,
		totalDiastolic: 0,
		totalValue: 0,
		startDate: data.recordedAt || new Date(),
		endDate: data.recordedAt || new Date(),
		normalCount: 0,
		elevatedCount: 0,
		criticalCount: 0,
	};

	// 2. Update Date Range
	existing.startDate = new Date(existing.startDate);
	const endDate = new Date(existing.endDate);
	existing.endDate = addMonths(endDate, 3);

	existing.totalCount += 1;
	if (data.severity === VitalSeverityEnum.NORMAL) existing.normalCount! += 1;
	if (data.severity === VitalSeverityEnum.ELEVATED)
		existing.elevatedCount! += 1;
	if (data.severity === VitalSeverityEnum.CRITICAL)
		existing.criticalCount! += 1;

	if (type === VitalTypes.BLOOD_PRESSURE && data.value.includes('/')) {
		const [sys, dia] = data.value.split('/').map(Number);
		existing.totalSystolic = (existing.totalSystolic || 0) + (sys || 0);
		existing.totalDiastolic = (existing.totalDiastolic || 0) + (dia || 0);
	} else {
		const numericValue = parseFloat(data.value);
		if (!isNaN(numericValue)) {
			existing.totalValue = (existing.totalValue || 0) + numericValue;
		}
	}

	updatedSummary[type] = existing;
	return updatedSummary;
}

export function upsertAdherences(
	adherence: { data: AdherenceLog; model: Model<AdherenceLog> },
	adherenceSummary: AdherenceInsights,
): AdherenceInsights {
	const { data } = adherence;
	const targetType = data.targetType as string;
	const targetName = data.targetName;

	// 1. Initialize deep structure if empty
	const updated: AdherenceInsights = {
		overview: adherenceSummary.overview || {
			totalLogs: 0,
			totalTaken: 0,
			totalMissed: 0,
			totalPartial: 0,
			overallAdherenceRate: 0,
			currentStreak: 0,
			longestStreak: 0,
		},
		byTargetType: { ...adherenceSummary.byTargetType },
	};

	const ov = updated.overview;

	// 2. Update Global Overview Counters
	ov.totalLogs += 1;
	if (data.status === 'taken') ov.totalTaken += 1;
	else if (data.status === 'missed') ov.totalMissed += 1;
	else if (data.status === 'partial') ov.totalPartial += 1;

	ov.overallAdherenceRate = (ov.totalTaken / ov.totalLogs) * 100;

	// 3. Initialize Target Type and Specific Target
	if (!updated.byTargetType[targetType]) {
		updated.byTargetType[targetType] = {
			totalLogs: 0,
			totalTaken: 0,
			totalMissed: 0,
			adherenceRate: 0,
			byTarget: {},
		};
	}
	const typeGroup = updated.byTargetType[targetType];

	if (!typeGroup.byTarget[targetName]) {
		typeGroup.byTarget[targetName] = {
			totalLogs: 0,
			takenCount: 0,
			missedCount: 0,
			partialCount: 0,
			adherenceRate: 0,
			currentStreak: 0,
			longestStreak: 0,
			firstLogDate: data.takenAt,
			lastLogDate: data.takenAt,
		};
	}
	const target = typeGroup.byTarget[targetName];

	// 4. Update Target Specific Stats
	target.totalLogs += 1;
	if (data.status === 'taken') {
		target.takenCount += 1;
		target.lastTakenAt = data.takenAt;
		target.currentStreak += 1;
	} else {
		if (data.status === 'missed') {
			target.missedCount += 1;
			target.lastMissedAt = data.takenAt;
		} else {
			target.partialCount += 1;
		}
		target.currentStreak = 0; // Streak breaks on anything not fully 'taken'
	}

	// Update Streaks
	if (target.currentStreak > target.longestStreak) {
		target.longestStreak = target.currentStreak;
	}

	target.lastLogDate = data.takenAt;
	target.adherenceRate = (target.takenCount / target.totalLogs) * 100;

	// 5. Roll up Target data to Type Group
	typeGroup.totalLogs += 1;
	if (data.status === 'taken') typeGroup.totalTaken += 1;
	if (data.status === 'missed') typeGroup.totalMissed += 1;
	typeGroup.adherenceRate = (typeGroup.totalTaken / typeGroup.totalLogs) * 100;

	// Determine best/worst target in this category
	const targetsInType = Object.entries(typeGroup.byTarget);
	typeGroup.bestTarget = targetsInType.reduce(
		(a: [string, any], b: [string, any]) =>
			a[1].adherenceRate > b[1].adherenceRate ? a : b,
	)[0];
	typeGroup.worstTarget = targetsInType.reduce(
		(a: [string, any], b: [string, any]) =>
			a[1].adherenceRate < b[1].adherenceRate ? a : b,
	)[0];

	// 6. Global Streak (Simplified: reflects the most recent action across all targets)
	if (data.status === 'taken') {
		ov.currentStreak += 1;
		if (ov.currentStreak > ov.longestStreak)
			ov.longestStreak = ov.currentStreak;
	} else {
		ov.currentStreak = 0;
	}

	return updated;
}
