import {
	BadRequestException,
	HttpException,
	InternalServerErrorException,
	Logger,
} from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { MongoServerError } from 'mongodb';
import mongoose from 'mongoose';

export class ApiErrorResponse {
	@ApiProperty()
	message: string;
	@ApiProperty()
	error: string;
	@ApiProperty()
	statusCode: number;
}

export function throwError(logger: Logger, error: any): void {
	// Handle duplicate key (unique constraint)
	if (error.name === MongoServerError.name && error.code === 11000) {
		const field = Object.keys(error.keyValue)[0];
		const value = error.keyValue[field];
		logger.warn(`duplicate key violation — field: ${field}, value: ${value}`);
		throw new BadRequestException(`forbidden: ${field}`);
	}

	// Handle invalid ObjectId or invalid referenced value
	if (error instanceof mongoose.Error.CastError) {
		logger.warn(`Invalid value for ${error.path}: ${error.value}`);
		throw new BadRequestException(
			`${error.path} has invalid value: ${error.value}`,
		);
	}

	// Handle validation errors
	if (error instanceof mongoose.Error.ValidationError) {
		const firstError = Object.values(error.errors)[0];
		logger.warn(firstError.message);

		throw new BadRequestException(firstError.message);
	}

	// Pass through http exceptions
	if (error instanceof HttpException) {
		throw error;
	}

	// Default fallback
	logger.error(
		`An error occurred: ${error.name} :: ${error.message}`,
		error.stack,
	);
	throw new InternalServerErrorException('An unexpected error occured');
}
