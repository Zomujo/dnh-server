import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { ObjectId } from 'mongodb';
import { BaseEntity } from '@/common/entities';
import { generateCode } from '@/common/utils/helpers/code-generator.helper';
import { deleteByPattern } from '@/core/caching/utils';
import { Facility } from '@/features/facilities/entities/facility.entity';

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
	@Prop({ unique: true, description: 'The name of the user or pharmacy' })
	userName: string;

	@Prop({ description: 'The SSO authentication provider' })
	provider: string;

	@Prop({ description: 'The SSO authentication provider user id' })
	providerUserId: string;

	@Prop({ description: "The user's email address" })
	email: string;

	@Prop({ description: 'The role of the personnel (e.g., doctor, pharmacist)' })
	role: string;

	@Prop({ description: 'The hashed password for authentication' })
	password: string;

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
}

export const PersonnelSchema = SchemaFactory.createForClass(Personnel);

PersonnelSchema.pre<Personnel>('save', async function () {
	if (this.isModified('password')) {
		this.password = await bcrypt.hash(this.password, 10);
	}

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
