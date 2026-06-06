import {
	ApiResponseProperty,
	IntersectionType,
	PickType,
} from '@nestjs/swagger';
import { GenericResponseDto } from '@/common/dto';
import { ConcernDto } from './concern.dto';

export class GetConcernDto extends IntersectionType(
	PickType(ConcernDto, ['concernType', 'description', 'onsetDate', 'resolved']),
	PickType(GenericResponseDto, ['id']),
) {
	@ApiResponseProperty({
		example: 'Symptom',
		enum: ['Symptom', 'Side Effect', 'Mental Health', 'General', 'Other'],
	})
	concernName: string;
}
