import {
	Body,
	Controller,
	Delete,
	Get,
	HttpStatus,
	Logger,
	Param,
	Patch,
	Post,
	Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CustomApiResponse } from '@/common/decorators';
import { ParseMongoIdPipe } from '@/common/decorators/validators/pipes';
import { PaginationRequestDto } from '@/common/dto';
import {
	ApiSuccessResponseDto,
	ApiSuccessResponseNoData,
	PaginatedDataResponseDto,
	throwError,
} from '@/common/utils/responses';
import { CreateSeededMedDto, GetSeededMedDto, UpdateSeededMedDto } from './dto';
import { SeededMedsService } from './seeded-meds.service';

@ApiTags('Seeded Medications')
@Controller('seeded-meds')
export class SeededMedsController {
	private logger = new Logger(SeededMedsController.name);

	constructor(private readonly seededMedsService: SeededMedsService) {}

	@CustomApiResponse(['created', 'authorizeChronicCare'], {
		message: 'Seeded medication created successfully',
	})
	@Post()
	async create(@Body() dto: CreateSeededMedDto) {
		try {
			const response = await this.seededMedsService.create(dto);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.CREATED,
				'Seeded medication created successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['paginated'], {
		type: GetSeededMedDto,
		message: 'Seeded medications fetched successfully',
	})
	@Get()
	async findAll(@Query() query: PaginationRequestDto) {
		try {
			const response = await this.seededMedsService.findAll(query);
			const paginated = new PaginatedDataResponseDto(
				response.rows,
				query.page,
				query.pageSize,
				response.count,
			);
			return new ApiSuccessResponseDto(
				paginated,
				HttpStatus.OK,
				'Seeded medications fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'notfound'], {
		type: GetSeededMedDto,
		message: 'Seeded medication fetched successfully',
	})
	@Get(':id')
	async findOne(@Param('id', ParseMongoIdPipe) id: string) {
		try {
			const response = await this.seededMedsService.findOne(id);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Seeded medication fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['updated', 'notfound', 'authorizeChronicCare'], {
		message: 'Seeded medication updated successfully',
	})
	@Patch(':id')
	async update(
		@Param('id', ParseMongoIdPipe) id: string,
		@Body() dto: UpdateSeededMedDto,
	) {
		try {
			const response = await this.seededMedsService.update(id, dto);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Seeded medication updated successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['successNull', 'notfound', 'authorizeChronicCare'], {
		message: 'Seeded medication deleted successfully',
	})
	@Delete(':id')
	async remove(@Param('id', ParseMongoIdPipe) id: string) {
		try {
			await this.seededMedsService.remove(id);
			return new ApiSuccessResponseNoData(
				HttpStatus.OK,
				'Seeded medication deleted successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}
}
