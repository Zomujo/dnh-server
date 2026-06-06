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
	@Prop({ unique: true })
	userId: string;

	@Prop()
	fcmToken: string;

	@Prop()
	userType: UserType;
}

export const UserTokenSchema = SchemaFactory.createForClass(UserToken);
