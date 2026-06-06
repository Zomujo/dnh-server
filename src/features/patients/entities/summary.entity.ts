import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ObjectId } from 'mongodb';
import { Types } from 'mongoose';
import { BaseEntity } from '@/common/entities';
import type { AiInsights } from '@/features/client/ai/agents/chronicleer/state';
import { VitalHistoryBody, VitalTypes } from '@/features/vital-histories/dto';
import type { AdherenceInsights } from '../../adherences/dto';
import type { ConcernInsights } from '../../concerns/dto';
import { Frequency } from '../../notifications/dto';
import { Patient } from './patient.entity';

@Schema({
	timestamps: true,
	toJSON: {
		transform: (_doc, ret: any) => {
			const id = ret._id;
			delete ret._id;
			delete ret.__v;
			return { id, ...ret };
		},
	},
})
export class Summary extends BaseEntity {
	@Prop({ required: true, description: 'User ID associated with this summary' })
	userId: string;

	@Prop({
		index: true,
		type: ObjectId,
		ref: 'Patient',
		required: true,
		description: 'Patient ID this summary belongs to',
	})
	patient: Patient;

	@Prop({
		type: Types.Map,
		of: Object,
		description: 'Map of chronic conditions with their status and notes',
	})
	chronicConditions: Record<string, { status: string; notes: string }>;

	@Prop({
		type: Types.Map,
		of: Object,
		description: 'Map of medications with frequency and expected count',
	})
	medications: Record<
		string,
		{ frequency: Frequency; totalExpectedCount: number }
	>;

	@Prop({
		type: Types.Map,
		of: Object,
		description: 'Map of patient concerns and their insights',
	})
	concerns: ConcernInsights;

	@Prop({
		type: Types.Map,
		of: Object,
		description: 'Map of vital histories by type',
	})
	vitalHistories: Record<VitalTypes, VitalHistoryBody>;

	@Prop({
		type: Types.Map,
		of: Object,
		description: 'Map of adherence insights',
	})
	adherences: AdherenceInsights;

	@Prop({
		type: Types.Map,
		of: Object,
		description: 'AI-generated insights for the patient',
	})
	aiInsights: AiInsights;
}

export const SummarySchema = SchemaFactory.createForClass(Summary);
