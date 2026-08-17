import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { ObjectId } from 'mongodb';
import { BaseEntity } from '@/common/entities';
import { Personnel } from '@/features/doctors/entities/personnel.entity';

export enum PersonnelAccountVerificationStatus {
	// No proof of identity yet; blocked at login.
	UNVERIFIED = 'unverified',
	// Identity proven — OTP completed, or the provider (e.g. Google) already vouched for the email.
	VERIFIED = 'verified',
	// Allowed to log in without verification because the assigned role doesn't require it yet
	// (see OTP_REQUIRED_ROLES). Kept distinct from VERIFIED so these accounts can be found and
	// pushed through real verification once that role's flow ships.
	EXEMPT = 'exempt',
}

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
export class PersonnelAccount extends BaseEntity {
	@Prop({ description: 'The SSO authentication provider' })
	provider: string;

	@Prop({ description: 'The SSO authentication provider user id' })
	providerUserId: string;

	@Prop({ description: "The user's email address" })
	email: string;

	@Prop({ description: 'The hashed password for authentication' })
	password?: string;

	@Prop({
		type: String,
		enum: PersonnelAccountVerificationStatus,
		default: PersonnelAccountVerificationStatus.UNVERIFIED,
		description: 'Identity verification status for this specific account',
	})
	verificationStatus: PersonnelAccountVerificationStatus;

	@Prop({
		type: ObjectId,
		ref: 'Personnel',
		description: 'Reference to the personnel this account belongs to',
	})
	personnel: Personnel;
}

export const PersonnelAccountSchema =
	SchemaFactory.createForClass(PersonnelAccount);

// One account per (email, provider) pair — a person may hold a separate
// EMAIL-password account and GOOGLE account under the same email, but never
// two accounts of the same provider for the same email.
PersonnelAccountSchema.index({ email: 1, provider: 1 }, { unique: true });

PersonnelAccountSchema.pre<PersonnelAccount>('save', async function () {
	if (this.isModified('password') && this.password) {
		this.password = await bcrypt.hash(this.password, 10);
	}
});
