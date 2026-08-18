import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BaseEntity } from '@/common/entities';
import { UserType } from '@/core/auth/enums';

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
export class UserToken extends BaseEntity {
	@Prop()
	userId: string;

	@Prop()
	fcmToken: string;

	@Prop({ type: String, enum: UserType })
	userType: UserType;
}

export const UserTokenSchema = SchemaFactory.createForClass(UserToken);

// One row per (userId, fcmToken) pair, not per userId — a user may be
// signed in on multiple devices at once, each with its own token.
UserTokenSchema.index({ userId: 1, fcmToken: 1 }, { unique: true });
