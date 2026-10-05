import {
	Body,
	Controller,
	Delete,
	Get,
	Headers,
	HttpStatus,
	Logger,
	Param,
	Patch,
	Post,
	Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Authorize, CustomApiResponse, GetUser } from '@/common/decorators';
import { ParseMongoIdPipe } from '@/common/decorators/validators/pipes';
import {
	ApiSuccessResponseDto,
	ApiSuccessResponseNoData,
	PaginatedDataResponseDto,
	throwError,
} from '@/common/utils/responses';
import { UserType } from '@/core/auth/enums';
import {
	CreatePersonnelAccountDto,
	GetPersonnelAccountDto,
	GetPersonnelAccountsQueryDto,
	UpdatePersonnelAccountDto,
} from './dto';
import { PersonnelAccountsService } from './personnel-accounts.service';

@ApiTags('Dnh Personnel-Accounts')
@Authorize(UserType.CHRONIC_CARE)
@Controller('personnel-accounts')
export class PersonnelAccountsController {
	private readonly logger = new Logger(PersonnelAccountsController.name);

	constructor(
		private readonly personnelAccountsService: PersonnelAccountsService,
	) {}

	@CustomApiResponse(['created', 'authorizeChronicCare'], {
		type: GetPersonnelAccountDto,
		message: 'Personnel account created successfully',
	})
	@Post()
	async create(
		@GetUser('sub') personnelId: string,
		@Body() dto: CreatePersonnelAccountDto,
	) {
		try {
			dto.personnel = personnelId;
			const response = await this.personnelAccountsService.create(dto);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.CREATED,
				'Personnel account created successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['created', 'authorizeChronicCare'], {
		message: 'Google account linked successfully',
	})
	@Post('google-link')
	async googleAccountLink(
		@GetUser('sub') personnelId: string,
		@Headers('idtoken') idToken: string,
	) {
		try {
			const response = await this.personnelAccountsService.googleAccountLink(
				{ idToken },
				personnelId,
			);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.CREATED,
				'Google account linked successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['paginated', 'authorizeChronicCare'], {
		type: GetPersonnelAccountDto,
		message: 'Personnel accounts fetched successfully',
	})
	@Get()
	async findAll(
		@GetUser('sub') personnelId: string,
		@Query() query: GetPersonnelAccountsQueryDto,
	) {
		try {
			const response = await this.personnelAccountsService.findAll(
				personnelId,
				query,
			);
			const paginated = new PaginatedDataResponseDto(
				response.rows,
				query.page,
				query.pageSize,
				response.count,
			);
			return new ApiSuccessResponseDto(
				paginated,
				HttpStatus.OK,
				'Personnel accounts fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'authorizeChronicCare'], {
		type: GetPersonnelAccountDto,
		message: 'Personnel account fetched successfully',
	})
	@Get(':id')
	async findOne(
		@GetUser('sub') personnelId: string,
		@Param('id', ParseMongoIdPipe) id: string,
	) {
		try {
			const response = await this.personnelAccountsService.findOne(
				id,
				personnelId,
			);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Personnel account fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['updated', 'authorizeChronicCare'], {
		message: 'Personnel account updated successfully',
	})
	@Patch(':id')
	async update(
		@GetUser('sub') personnelId: string,
		@Param('id', ParseMongoIdPipe) id: string,
		@Body() dto: UpdatePersonnelAccountDto,
	) {
		try {
			const response = await this.personnelAccountsService.update(
				id,
				personnelId,
				dto,
			);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Personnel account updated successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['successNull', 'authorizeChronicCare'], {
		type: ApiSuccessResponseNoData,
		message: 'Personnel account deleted successfully',
	})
	@Delete(':id')
	async remove(
		@GetUser('sub') personnelId: string,
		@Param('id', ParseMongoIdPipe) id: string,
	) {
		try {
			await this.personnelAccountsService.remove(id, personnelId);
			return new ApiSuccessResponseNoData(
				HttpStatus.OK,
				'Personnel account deleted successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}
}
