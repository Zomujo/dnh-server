import * as mongoose from 'mongoose';

export const ObjectId = mongoose.Schema.Types.ObjectId;
export { BaseEntity } from './base.entity';
export { BaseDH, flattenMeta } from './base-dh.entity';
