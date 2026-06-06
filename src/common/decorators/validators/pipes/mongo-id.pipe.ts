import {
	ArgumentMetadata,
	BadRequestException,
	Injectable,
	PipeTransform,
} from '@nestjs/common';

@Injectable()
export class ParseMongoIdPipe implements PipeTransform<string, string> {
	transform(value: string, _metadata: ArgumentMetadata) {
		const mongoIdRegex = /^[0-9a-fA-F]{24}$/;
		const isMongoId = mongoIdRegex.test(value);
		if (isMongoId) {
			return value;
		} else {
			throw new BadRequestException('Mongo Id is not valid');
		}
	}
}
