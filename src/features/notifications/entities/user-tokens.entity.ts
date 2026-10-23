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

// A token is one device, owned by one user (whoever registered it last);
// a user may still have several rows, one per device. PushService
// de-duplicates legacy rows at startup before this index is built.
UserTokenSchema.index({ fcmToken: 1 }, { unique: true });
UserTokenSchema.index({ userId: 1, updatedAt: -1 });
