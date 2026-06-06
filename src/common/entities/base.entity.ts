import { Document } from 'mongoose';

export class BaseEntity extends Document {
	id: string;
	createdAt: Date;
	updatedAt: Date;
}
