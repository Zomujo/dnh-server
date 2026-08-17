import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ObjectId } from 'mongodb';
import { BaseEntity } from '@/common/entities';
import { generateCode } from '@/common/utils/helpers/code-generator.helper';
import { deleteByPattern } from '@/core/caching/utils';
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
		this.referralCode = generateCode('CCREF', this.userName);
	}
});

PersonnelSchema.post<Personnel>('save', async function (doc) {
	await deleteByPattern(
		process.env.REDIS_URL!,
		`token=${doc._id}*chronic-care*personnel*current`,
	);
});

PersonnelSchema.post<Personnel>(
	'findOneAndUpdate',
	async function (doc: Personnel | null) {
		await deleteByPattern(
			process.env.REDIS_URL!,
			`token=${doc ? doc._id : ''}*chronic-care*personnel*current`,
		);
	},
);
