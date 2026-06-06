import { Prop } from '@nestjs/mongoose';
import { toHeaderCase } from 'js-convert-case';
import { Types } from 'mongoose';
import { BaseEntity } from '@/common/entities';

export class BaseDH extends BaseEntity {
	@Prop({ type: Types.Map, of: Object })
	meta: Record<string, any>;

	@Prop()
	qdrantId: string;
}

export function flattenMeta(meta: Record<string, any>) {
	const entries = Array.from(meta.entries()) as [[string, any]];
	const flatMeta = entries.reduce((acc: string, [key, value]) => {
		key = toHeaderCase(key);
		const pair = `${key}: ${value}`;
		return acc + pair + '\n';
	}, '');

	return flatMeta as string;
}
