import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ObjectId } from 'mongodb';
import { BaseEntity } from '@/common/entities';
import { Personnel } from '@/features/doctors/entities/personnel.entity';
import { Facility } from '@/features/facilities/entities/facility.entity';
import { Patient } from '@/features/patients/entities/patient.entity';
import { AppointmentStatus } from '../dto';

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
export class Appointment extends BaseEntity {
	@Prop({ description: 'Title of the appointment (e.g., Follow-up check)' })
	title: string;

	@Prop({ description: 'Detailed description or notes about the appointment' })
	description: string;

	@Prop({
		description:
			'Reason for cancellation or rescheduling (populated based on status)',
	})
	reason: string;

	@Prop({ description: 'Date and time when the appointment is scheduled' })
	appointmentDate: Date;

	@Prop({
		type: String,
		enum: AppointmentStatus,
		description: "Current status of the appointment. Example: 'scheduled'",
	})
	status: AppointmentStatus;

	@Prop({
		type: ObjectId,
		ref: 'Personnel',
		description:
			'Reference to the personnel (doctor/pharmacist) meeting the patient',
	})
	hostPersonnel: Personnel;

	@Prop({
		type: ObjectId,
		ref: 'Facility',
		description: 'Medical facility this appointment belongs to',
	})
	host: Facility;

	@Prop({
		description: 'User ID associated with the appointment (3–50 characters)',
	})
	userId: string;

	@Prop({
		index: true,
		type: ObjectId,
		ref: 'Patient',
		description:
			'Patient ID (MongoDB ObjectId) associated with this appointment',
	})
	patient: Patient;

	@Prop({
		description: 'Date and time when the appointment was rescheduled',
	})
	rescheduledAt: Date;

	@Prop({
		type: ObjectId,
		ref: 'Personnel',
		description: 'Reference to the personnel who rescheduled the appointment',
	})
	rescheduledBy: Personnel;

	@Prop({
		description: 'Date and time when the appointment was cancelled',
	})
	cancelledAt: Date;

	@Prop({
		description: 'Date and time when the appointment was completed',
	})
	completedAt: Date;

	@Prop({
		type: ObjectId,
		ref: 'Personnel',
		description: 'Reference to the personnel who cancelled the appointment',
	})
	cancelledBy: Personnel;

	@Prop({
		default: 0,
		description: 'Number of times this appointment has been rescheduled',
	})
	rescheduledCount: number;
}

export const AppointmentSchema = SchemaFactory.createForClass(Appointment);
