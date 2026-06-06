import { Model } from 'mongoose';
import { AdherenceLog } from '@/features/adherences/entities/adherence-log.entity';
import { ChronicCondition } from '@/features/chronic-conditions/entities/chronic-condition.entity';
import { Concern } from '@/features/concerns/entities/concern.entity';
import { Medication } from '@/features/medications/entities/medication.entity';
import { Patient } from '@/features/patients/entities/patient.entity';
import { VitalHistory } from '@/features/vital-histories/entities/vital-history.entity';
import { AugurNotification } from '../../notifications/entities/notification.entity';
import { SummaryDto } from '../dto';
import { Summary } from '../entities/summary.entity';
import {
	getConcernInsights,
	upsertAdherences,
	upsertChronicCondition,
	upsertMedication,
	upsertVitalHistories,
} from './summary.helpers';

export enum Sections {
	PATIENT = 'patient',
	CHRONIC_CONDITIONS = 'chronicConditions',
	MEDICATIONS = 'medications',
	CONCERNS = 'concerns',
	VITAL_HISTORIES = 'vitalHistories',
	ADHERENCES = 'adherences',
}

export type SummaryModels = Record<Sections, { data: any; model: Model<any> }>;
export type UserData = { patientId: string; userId: string };

export async function upsertSummary(
	section: Sections,
	models: SummaryModels,
	userData: UserData,
	summaryModel: Model<Summary>,
	notificationModel?: Model<AugurNotification>,
) {
	const summary = await summaryModel
		.findOne({ userId: userData.userId })
		.select(`patient userId ${section}`)
		.lean();

	let payload: Partial<SummaryDto> | null = summary;

	if (!summary || !payload) {
		payload = { userId: userData.userId, patient: userData.patientId };
	}

	switch (section) {
		case Sections.PATIENT: {
			const data = models.patient.data as unknown as Patient;
			payload.patient = data._id.toString();
			break;
		}
		case Sections.CHRONIC_CONDITIONS: {
			const data = models.chronicConditions.data as unknown as ChronicCondition;
			const model = models.chronicConditions
				.model as unknown as Model<ChronicCondition>;
			payload.chronicConditions = await upsertChronicCondition(
				{ data, model },
				payload.chronicConditions || {},
			);
			break;
		}
		case Sections.MEDICATIONS: {
			const data = models.medications.data as unknown as Medication;
			const model = models.medications.model as unknown as Model<Medication>;
			payload.medications = await upsertMedication(
				{ data, model },
				payload.medications!,
				userData.patientId,
				notificationModel!,
			);
			break;
		}
		case Sections.CONCERNS: {
			const concernModel = models.concerns.model as unknown as Model<Concern>;
			payload.concerns = await getConcernInsights(
				userData.patientId,
				concernModel,
			);
			break;
		}
		case Sections.VITAL_HISTORIES: {
			const data = models.vitalHistories.data as unknown as VitalHistory;
			const model = models.vitalHistories
				.model as unknown as Model<VitalHistory>;
			payload.vitalHistories = upsertVitalHistories(
				{ data, model },
				payload.vitalHistories || {},
			);
			break;
		}
		case Sections.ADHERENCES: {
			const data = models.adherences.data as unknown as AdherenceLog;
			const model = models.adherences.model as unknown as Model<AdherenceLog>;
			payload.adherences = upsertAdherences(
				{ data, model },
				payload.adherences || {},
			);
			break;
		}
		default:
			break;
	}

	const summaryUpdate = await summaryModel.findOneAndUpdate(
		{
			userId: userData.userId,
		},
		{ ...payload },
		{ upsert: true, returnDocument: 'after' },
	);

	return summaryUpdate._id.toString();
}
