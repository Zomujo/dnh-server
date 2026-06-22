import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ObjectId } from 'mongodb';
import { BaseEntity } from '@/common/entities';
import { Patient } from '@/features/patients/entities/patient.entity';
import { Facility } from '../../../facilities/entities/facility.entity';
import {
	AppointmentRequestStatus,
	AppointmentRequestType,
} from '../dto/appointment-request.dto';

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
export class AppointmentRequest extends BaseEntity {
	@Prop({
		type: String,
		enum: AppointmentRequestType,
		description: 'Type of appointment request',
	})
	type: AppointmentRequestType;

	@Prop({
		type: ObjectId,
		ref: 'Patient',
		description: 'Patient who made the request',
	})
	patient: Patient;

	@Prop({
		type: ObjectId,
		ref: 'Facility',
		description: 'Medical facility the request is for',
	})
	host: Facility;

	@Prop({
		description: 'Details about the appointment request',
	})
	description: string;

	@Prop({
		description: 'Preferred date and time for the appointment',
	})
	preferredDate: Date;

	@Prop({
		type: String,
		enum: AppointmentRequestStatus,
		description: 'Current status of the request',
	})
	status: AppointmentRequestStatus;
}

export const AppointmentRequestSchema =
	SchemaFactory.createForClass(AppointmentRequest);
