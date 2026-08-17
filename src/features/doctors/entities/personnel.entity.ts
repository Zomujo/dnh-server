import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ObjectId } from 'mongodb';
import type { Model } from 'mongoose';
import { BaseEntity } from '@/common/entities';
import { generateCode } from '@/common/utils/helpers/code-generator.helper';
import { Facility } from '@/features/facilities/entities/facility.entity';
import { PersonnelAccount } from '../auth/personnel-accounts/entities/personnel-account.entity';

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
export class Personnel extends BaseEntity {
	@Prop({ unique: false, description: 'The name of the personnel' })
	userName: string;

	@Prop({ description: "The user's phone number" })
	phoneNumber: string;

	@Prop({ description: "The personnel's identification number" })
	personnelIdNumber: string;

	@Prop({ description: 'The role of the personnel (e.g., doctor, pharmacist)' })
	role: string;

	@Prop({
		unique: true,
		description: 'Unique referral code generated for this personnel',
	})
	referralCode: string;

	@Prop({
		type: ObjectId,
		ref: 'Facility',
		description: 'Reference to the facility this personnel belongs to',
	})
	facility: Facility;

	@Prop({
		type: [ObjectId],
		ref: 'PersonnelAccount',
		description: 'References to the auth accounts belonging to this personnel',
	})
	personnelAccounts: PersonnelAccount[];
}

export const PersonnelSchema = SchemaFactory.createForClass(Personnel);

PersonnelSchema.pre<Personnel>('save', async function () {
	if (this.isNew) {
		const PersonnelModel = this.constructor as Model<Personnel>;
		const MAX_ATTEMPTS = 5;
		for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
			const candidate = generateCode();
			if (!(await PersonnelModel.exists({ referralCode: candidate }))) {
				this.referralCode = candidate;
				return;
			}
		}
		throw new Error(
			`Could not generate a unique referral code after ${MAX_ATTEMPTS} attempts`,
		);
	}
});
