import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

// Kept apart from patient.entity.ts, which imports the patient DTOs: the
// consent DTOs need these enums without that import cycle.

/** How a consent decision reached us. */
export enum ConsentChannel {
	/** The patient recorded it themselves in the mobile app. */
	APP = 'app',
	/** The patient recorded it over USSD. */
	USSD = 'ussd',
	/** A clinician/pharmacy user captured it while registering the patient. */
	HCP = 'hcp',
}

export enum ConsentStatus {
	GRANTED = 'granted',
	WITHDRAWN = 'withdrawn',
}

/**
 * One consent decision for processing the patient's health data (Data
 * Protection Act, 2012 (Act 843): health data is special personal data).
 * `policyVersion` names the privacy notice the patient was shown, so a later
 * notice change can be re-consented.
 */
@Schema({ _id: false })
export class ConsentRecord {
	@Prop({ type: String, enum: ConsentStatus, required: true })
	status: ConsentStatus;

	@Prop({ required: true, description: 'Privacy notice / consent version' })
	policyVersion: string;

	@Prop({ type: String, enum: ConsentChannel, required: true })
	channel: ConsentChannel;

	@Prop({ required: true, description: 'When the decision was recorded' })
	recordedAt: Date;

	@Prop({
		type: Types.ObjectId,
		ref: 'Personnel',
		description: 'Personnel who captured the consent (channel hcp only)',
	})
	recordedBy?: Types.ObjectId;

	@Prop({
		description:
			'Set when staff re-granted consent over an earlier withdrawal by the patient',
	})
	overridesWithdrawal?: boolean;
}

export const ConsentRecordSchema = SchemaFactory.createForClass(ConsentRecord);
