import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Logger,
	Param,
	ParseFilePipeBuilder,
	Post,
	Query,
	Res,
	UploadedFile,
	UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
	ApiBody,
	ApiConsumes,
	ApiNoContentResponse,
	ApiQuery,
	ApiTags,
} from '@nestjs/swagger';
import { CustomApiResponse, GetUser } from '@/common/decorators';
import {
	ApiSuccessResponseDto,
	ApiSuccessResponseNoData,
	PaginatedDataResponseDto,
	throwError,
} from '@/common/utils/responses';
import { GetAdherencePatternDto } from '@/features/adherences/dto';
import { GetChronicConditionDto } from '@/features/chronic-conditions/dto';
import { GetConcernDto } from '@/features/concerns/dto';
import { GetMedicationDto } from '@/features/medications/dto';
import { GetPatientDto } from '@/features/patients/dto';
import {
	BpTrendsQueryDto,
	BpTrendsResponseDto,
	GetVitalHistoryDto,
	LoadVitalHistoryDto,
	VitalHistoryTrendsQueryDto,
	VitalHistoryTrendsResponseDto,
} from '@/features/vital-histories/dto';
import { SupportedLanguages } from './ai/states';
import { ClientService } from './client.service';
import {
	AudioUploadDto,
	ChronicCareChatMessageDto,
	ChronicCareConversationResponseDto,
	ChronicCareQueryDto,
	ChronicChatMessagesQueryDto,
	CreateChronicCareDto,
	MedicationAdherenceDto,
} from './dto';

@ApiTags('Client')
@Controller('client')
export class ClientController {
	private logger = new Logger(ClientController.name);
	constructor(private readonly clientService: ClientService) {}

	@Post('chat')
	@ApiQuery({ name: 'lang', enum: SupportedLanguages, required: true })
	@HttpCode(HttpStatus.OK)
	@CustomApiResponse(['success', 'authorize'], {
		type: ChronicCareConversationResponseDto,
		message: 'Chat message sent successfully',
	})
	@ApiNoContentResponse({
		description: 'No content',
	})
	async chat(
		@Body() createChronicCareDto: CreateChronicCareDto,
		@GetUser('sub') userId: string,
		@Query('lang') language: SupportedLanguages,
		@Res() res: any,
	) {
		try {
			const response = await this.clientService.chat(
				createChronicCareDto,
				userId,
				language,
			);

			if (!response.outResponse) {
				res
					.status(HttpStatus.NO_CONTENT)
					.send(
						new ApiSuccessResponseNoData(HttpStatus.NO_CONTENT, 'No content'),
					);
				return;
			}

			res
				.status(HttpStatus.OK)
				.send(
					new ApiSuccessResponseDto(
						response,
						HttpStatus.OK,
						'Chat message sent successfully',
					),
				);
			return;
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'authorize'], {
		type: ChronicCareConversationResponseDto,
		message: 'Chat audio received successfully',
	})
	@Post('chat/audio')
	@HttpCode(HttpStatus.OK)
	@UseInterceptors(FileInterceptor('file'))
	@ApiConsumes('multipart/form-data')
	@ApiBody({
		description: 'Audio file to be uploaded',
		type: AudioUploadDto,
	})
	@ApiQuery({ name: 'lang', enum: SupportedLanguages, required: true })
	@ApiQuery({ name: 'audioId', type: String, required: true })
	async chatAudio(
		@UploadedFile(
			new ParseFilePipeBuilder()
				.addFileTypeValidator({ fileType: /m(?:4a|peg|p4)$/i })
				.build({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }),
		)
		file: Express.Multer.File,
		@Query('lang') language: SupportedLanguages,
		@Query('audioId') audioId: string,
		@GetUser('sub') userId: string,
	) {
		try {
			const response = await this.clientService.chatAudio(
				file,
				userId,
				language,
				audioId,
			);
			this.logger.log('ai audio response', response);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Chat audio received successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success'], {
		type: ChronicCareConversationResponseDto,
		message: 'Chat audio received successfully',
	})
	@Post('chat/test-audio')
	@HttpCode(HttpStatus.OK)
	@UseInterceptors(FileInterceptor('file'))
	@ApiConsumes('multipart/form-data')
	@ApiBody({
		description: 'Audio file to be uploaded',
		type: AudioUploadDto,
	})
	@ApiQuery({ name: 'question', type: String, required: true })
	async testAudioTranscription(
		@UploadedFile(
			new ParseFilePipeBuilder()
				.addFileTypeValidator({ fileType: /m(?:4a|peg|p4)$/i })
				.build({ errorHttpStatusCode: HttpStatus.BAD_REQUEST }),
		)
		file: Express.Multer.File,
		@Query('question') question: string,
	) {
		try {
			const response = await this.clientService.testChatAudio(file, question);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Chat audio received successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'authorize'], {
		type: GetPatientDto,
		message: 'General data fetched successfully',
	})
	@Get('patient')
	async fetchPatientData(@GetUser('sub') userId: string) {
		try {
			const response = await this.clientService.fetchPatientData(userId);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Patient data fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['paginated', 'authorize'], {
		type: GetChronicConditionDto,
		message: 'Chronic conditions fetched successfully',
	})
	@Get('chronic-conditions')
	async fetchChronicConditions(
		@Query() query: ChronicCareQueryDto,
		@GetUser('sub') userId: string,
	) {
		try {
			const response = await this.clientService.fetchChronicConditions(
				query,
				userId,
			);
			const paginated = new PaginatedDataResponseDto(
				response.chronicConditions,
				query.page,
				query.pageSize,
				response.count,
			);
			return new ApiSuccessResponseDto(
				paginated,
				HttpStatus.OK,
				'Chronic conditions fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['paginated', 'authorize'], {
		type: GetMedicationDto,
		message: 'Medications fetched successfully',
	})
	@Get('medications')
	async fetchMedications(
		@Query() query: ChronicCareQueryDto,
		@GetUser('sub') userId: string,
	) {
		try {
			const response = await this.clientService.fetchMedications(query, userId);
			const paginated = new PaginatedDataResponseDto(
				response.medications,
				query.page,
				query.pageSize,
				response.count,
			);
			return new ApiSuccessResponseDto(
				paginated,
				HttpStatus.OK,
				'Medications fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['created', 'authorize'], {
		message: 'Vital history logged successfully',
	})
	@Post('vital-histories/log')
	async logVitalHistory(
		@Body() dto: LoadVitalHistoryDto,
		@GetUser('sub') userId: string,
	) {
		try {
			const response = await this.clientService.logVitalHistory(dto, userId);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.CREATED,
				'Vital history logged successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'authorize'], {
		type: GetVitalHistoryDto,
		isArray: true,
		message: 'Vital histories fetched successfully',
	})
	@Get('vital-histories')
	async fetchVitalHistory(@GetUser('sub') userId: string) {
		try {
			const response = await this.clientService.fetchVitalHistory(userId);
			return new ApiSuccessResponseDto(
				response.rows,
				HttpStatus.OK,
				'Vital histories fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'authorize', 'notfound'], {
		type: BpTrendsResponseDto,
		message: 'BP trends fetched successfully',
	})
	@Get('vital-histories/trends/bp')
	async fetchBpTrends(
		@Query() query: BpTrendsQueryDto,
		@GetUser('sub') userId: string,
	) {
		try {
			const response = await this.clientService.fetchBPTrend(userId, query);

			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'BP trends fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'authorize', 'notfound'], {
		type: VitalHistoryTrendsResponseDto,
		message: 'Vital history trends fetched successfully',
	})
	@Get('vital-histories/trends')
	async fetchVitalHistoryTrends(
		@Query() query: VitalHistoryTrendsQueryDto,
		@GetUser('sub') userId: string,
	) {
		try {
			const response = await this.clientService.fetchVitalTrend(userId, query);

			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Vital history trends fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['paginated', 'authorize'], {
		type: GetAdherencePatternDto,
		message: 'Adherence patterns fetched successfully',
	})
	@Get('adherence-patterns')
	async fetchAdherencePatterns(
		@Query() query: ChronicCareQueryDto,
		@GetUser('sub') userId: string,
	) {
		try {
			const response = await this.clientService.fetchAdherencePatterns(
				query,
				userId,
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
				'Adherence patterns fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['successNull'], {
		message: 'Patient data cleaned successfully',
	})
	@ApiQuery({ name: 'patientId', required: false })
	@Delete('clean/:userId')
	async purgePatient(
		@Param('userId') userId: string,
		@Query('patientId') patientId: string,
	) {
		try {
			await this.clientService.purgePatient(userId, patientId);

			return new ApiSuccessResponseNoData(
				HttpStatus.OK,
				'Patient data cleaned successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'authorize'], {
		type: MedicationAdherenceDto,
		message: 'Medication adherence fetched successfully',
	})
	@Get('medication-adherence')
	@ApiQuery({ name: 'showWeekdays', type: Boolean, required: false })
	async fetchMedicationAdherence(
		@GetUser('sub') userId: string,
		@Query('showWeekdays') showWeekdays?: string,
	) {
		try {
			const response = await this.clientService.fetchMedicationAdherence(
				userId,
				showWeekdays === 'true',
			);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Medication adherence fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['paginated', 'authorize'], {
		type: GetConcernDto,
		message: 'Concerns fetched successfully',
	})
	@Get('concerns')
	async fetchConcerns(
		@Query() query: ChronicCareQueryDto,
		@GetUser('sub') userId: string,
	) {
		try {
			const response = await this.clientService.fetchConcerns(query, userId);
			const paginated = new PaginatedDataResponseDto(
				response.concerns,
				query.page,
				query.pageSize,
				response.count,
			);
			return new ApiSuccessResponseDto(
				paginated,
				HttpStatus.OK,
				'Concerns fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['paginated', 'authorize'], {
		type: ChronicCareChatMessageDto,
		message: 'Chat conversation history retrieved successfully',
	})
	@Get('chats')
	async retrieveChatMessages(
		@Query() query: ChronicChatMessagesQueryDto,
		@GetUser('sub') userId: string,
	) {
		try {
			const response = await this.clientService.retrieveChatMessages(
				userId,
				query,
			);
			const paginated = new PaginatedDataResponseDto(
				response.rows || [],
				query.page,
				query.pageSize,
				response.count,
			);
			return new ApiSuccessResponseDto(
				paginated,
				HttpStatus.OK,
				'Chat conversation history retrieved successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['successNull', 'authorize'], {
		message: 'Chat conversation message deleted successfully',
	})
	@Delete('chats/:id')
	async deleteChatMessage(@Param('id') id: string) {
		try {
			await this.clientService.removeChatMessages(id);
			return new ApiSuccessResponseNoData(
				HttpStatus.OK,
				'Chat conversation message deleted successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}
}
