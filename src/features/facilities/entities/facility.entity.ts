import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BaseEntity } from '@/common/entities';

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
export class Facility extends BaseEntity {
	@Prop({ description: 'Name of the medical facility' })
	name: string;

	@Prop({ description: 'Phone number of the appointment host' })
	phoneNumber: string;
}

export const FacilitySchema = SchemaFactory.createForClass(Facility);
