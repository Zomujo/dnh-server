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
	Patch,
	Post,
	Put,
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
import { generateFilter } from '@/common/factory';
import {
	ApiSuccessResponseDto,
	ApiSuccessResponseNoData,
	PaginatedDataResponseDto,
	throwError,
} from '@/common/utils/responses';
import { GetAdherencePatternDto } from '@/features/adherences/dto';
import {
	CreateAppointmentRequestDto,
	GetAppointmentRequestDto,
} from '@/features/appointments/appointment-requests/dto';
import {
	GetAppointmentDto,
	GetAppointmentsQueryDto,
} from '@/features/appointments/dto';
import { GetChronicConditionDto } from '@/features/chronic-conditions/dto';
import {
	AddSymptomsDto,
	GetConcernDto,
	GetSymptomDto,
	GetSymptomsQueryDto,
	UpdateConcernDto,
} from '@/features/concerns/dto';
import {
	GetFacilitiesQueryDto,
	GetFacilityDto,
} from '@/features/facilities/dto';
import {
	AdherenceLogsQueryDto,
	CreateMedicationDto,
	GetMedicationDto,
	MedicationAdherenceLogsDto,
	MedicationDetailDto,
	TodaysMedicationCountDto,
	TodaysMedicationDto,
	TodaysMedicationsQueryDto,
	UpdateMedicationDto,
} from '@/features/medications/dto';
import { GetSeededMedDto } from '@/features/medications/seeded-meds/dto';
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
	PreloadedMedsQueryDto,
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

	@CustomApiResponse(['paginated', 'authorize'], {
		type: GetAppointmentDto,
		message: 'Appointments fetched successfully',
	})
	@Get('appointments')
	async fetchAppointments(
		@Query() query: GetAppointmentsQueryDto,
		@GetUser('sub') userId: string,
	) {
		try {
			const response = await this.clientService.fetchAppointments(
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
				'Appointments fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'authorize'], {
		type: GetAppointmentDto,
		message: 'Nearest appointment fetched successfully',
	})
	@Get('appointments/nearest')
	async fetchNearestAppointment(@GetUser('sub') userId: string) {
		try {
			const response = await this.clientService.fetchNearestAppointment(userId);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Nearest appointment fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'authorize'], {
		type: GetAppointmentRequestDto,
		message: 'Appointment request created successfully',
	})
	@Post('appointment-requests')
	async createAppointmentRequest(
		@Body() dto: CreateAppointmentRequestDto,
		@GetUser('sub') userId: string,
	) {
		try {
			const response = await this.clientService.createAppointmentRequest(
				dto,
				userId,
			);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.CREATED,
				'Appointment request created successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['paginated', 'authorize'], {
		type: GetAppointmentRequestDto,
		message: 'Appointment requests fetched successfully',
	})
	@Get('appointment-requests')
	async fetchAppointmentRequests(
		@Query() query: ChronicCareQueryDto,
		@GetUser('sub') userId: string,
	) {
		try {
			const response = await this.clientService.fetchAppointmentRequests(
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
				'Appointment requests fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'authorize'], {
		type: TodaysMedicationCountDto,
		message: "Today's medication counts fetched successfully",
	})
	@Get('medications/today/count')
	async countTodaysMedications(@GetUser('sub') userId: string) {
		try {
			const response = await this.clientService.countTodaysMedications(userId);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				"Today's medication counts fetched successfully",
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'authorize'], {
		type: TodaysMedicationDto,
		isArray: true,
		message: "Today's medications fetched successfully",
	})
	@Get('medications/today')
	async fetchTodaysMedications(
		@Query() query: TodaysMedicationsQueryDto,
		@GetUser('sub') userId: string,
	) {
		try {
			const response = await this.clientService.fetchTodaysMedications(
				query.section,
				userId,
			);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				"Today's medications fetched successfully",
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['updated', 'authorize', 'notfound'], {
		message: 'Medication confirmed successfully',
	})
	@Put('medications/:medicationId/confirm')
	async confirmMedication(
		@Param('medicationId') medicationId: string,
		@Query() query: TodaysMedicationsQueryDto,
		@GetUser('sub') userId: string,
	) {
		try {
			const response = await this.clientService.confirmMedication(
				medicationId,
				userId,
				query.section,
			);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Medication confirmed successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'authorize'], {
		type: MedicationAdherenceLogsDto,
		message: 'Medication adherence logs fetched successfully',
	})
	@Get('medications/:medicationId/adherence')
	async fetchMedicationAdherenceLogs(
		@Param('medicationId') medicationId: string,
		@Query() query: AdherenceLogsQueryDto,
		@GetUser('sub') userId: string,
	) {
		try {
			const response = await this.clientService.fetchMedicationAdherenceLogs(
				medicationId,
				userId,
				new Date(query.date),
			);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Medication adherence logs fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['created', 'authorize'], {
		message: 'Vital history logged successfully',
	})
	@Post('vital-histories/logs')
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

	@CustomApiResponse(['paginated', 'authorize'], {
		type: GetVitalHistoryDto,
		message: 'Vital history logs fetched successfully',
	})
	@Get('vital-histories/logs')
	async fetchVitalHistoryLogs(
		@Query() query: ChronicCareQueryDto,
		@GetUser('sub') userId: string,
	) {
		try {
			const { pageFilter } = generateFilter(query);
			const response = await this.clientService.fetchVitalHistoryLogs(
				userId,
				pageFilter.offset,
				pageFilter.limit,
			);
			const paginated = new PaginatedDataResponseDto(
				response.rows,
				query.page || 1,
				query.pageSize || 10,
				response.count,
			);
			return new ApiSuccessResponseDto(
				paginated,
				HttpStatus.OK,
				'Vital history logs fetched successfully',
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

	@CustomApiResponse(['successNull', 'authorize'], {
		message: 'Patient data cleaned successfully',
	})
	@Delete('clean')
	async purgePatient(@GetUser('sub') userId: string) {
		try {
			await this.clientService.purgePatient(userId);

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

	@CustomApiResponse(['created', 'authorize'], {
		type: String,
		message: 'Medication created successfully',
	})
	@Post('medications')
	async createMedication(
		@Body() dto: CreateMedicationDto,
		@GetUser('sub') userId: string,
	) {
		try {
			const response = await this.clientService.createMedication(dto, userId);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.CREATED,
				'Medication created successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['paginated', 'authorize'], {
		type: GetSeededMedDto,
		message: 'Preloaded medications fetched successfully',
	})
	@Get('medications/preloaded')
	async fetchPreloadedMeds(@Query() query: PreloadedMedsQueryDto) {
		try {
			const response = await this.clientService.fetchPreloadedMeds(query);
			const paginated = new PaginatedDataResponseDto(
				response.rows,
				query.page || 1,
				query.pageSize || 10,
				response.count,
			);
			return new ApiSuccessResponseDto(
				paginated,
				HttpStatus.OK,
				'Preloaded medications fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['paginated', 'authorize'], {
		type: GetFacilityDto,
		message: 'Facilities fetched successfully',
	})
	@Get('facilities')
	async fetchFacilities(@Query() query: GetFacilitiesQueryDto) {
		try {
			const response = await this.clientService.fetchFacilities(query);
			const paginated = new PaginatedDataResponseDto(
				response.rows,
				query.page || 1,
				query.pageSize || 10,
				response.count,
			);
			return new ApiSuccessResponseDto(
				paginated,
				HttpStatus.OK,
				'Facilities fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'authorize'], {
		type: MedicationDetailDto,
		message: 'Medication fetched successfully',
	})
	@Get('medications/:id')
	async fetchMedicationById(@Param('id') id: string) {
		try {
			const response = await this.clientService.fetchMedicationById(id);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Medication fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['updated', 'authorize'], {
		message: 'Medication updated successfully',
	})
	@Patch('medications/:id')
	async updateMedication(
		@Param('id') id: string,
		@Body() dto: UpdateMedicationDto,
	) {
		try {
			const response = await this.clientService.updateMedication(id, dto);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Medication updated successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['successNull', 'authorize'], {
		message: 'Medication deleted successfully',
	})
	@Delete('medications/:id')
	async deleteMedication(@Param('id') id: string) {
		try {
			await this.clientService.deleteMedication(id);
			return new ApiSuccessResponseNoData(
				HttpStatus.OK,
				'Medication deleted successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['created', 'authorize'], {
		message: 'Symptom created successfully',
	})
	@Post('symptoms')
	async createSymptom(
		@GetUser('sub') userId: string,
		@Body() dto: AddSymptomsDto,
	) {
		try {
			const response = await this.clientService.createSymptom(userId, dto);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.CREATED,
				'Symptom created successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['paginated', 'authorize'], {
		type: GetSymptomDto,
		message: 'Symptoms fetched successfully',
	})
	@Get('symptoms')
	async fetchSymptoms(
		@GetUser('sub') userId: string,
		@Query() query: GetSymptomsQueryDto,
	) {
		try {
			const response = await this.clientService.fetchSymptoms(userId, query);
			const paginated = new PaginatedDataResponseDto(
				response.rows,
				query.page || 1,
				query.pageSize || 10,
				response.count,
			);
			return new ApiSuccessResponseDto(
				paginated,
				HttpStatus.OK,
				'Symptoms fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['success', 'notfound', 'authorize'], {
		type: GetSymptomDto,
		message: 'Symptom fetched successfully',
	})
	@Get('symptoms/:id')
	async fetchSymptomById(
		@GetUser('sub') userId: string,
		@Param('id') id: string,
	) {
		try {
			const response = await this.clientService.fetchSymptomById(id, userId);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Symptom fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['updated', 'notfound', 'authorize'], {
		message: 'Symptom updated successfully',
	})
	@Patch('symptoms/:id')
	async updateSymptom(
		@GetUser('sub') userId: string,
		@Param('id') id: string,
		@Body() dto: UpdateConcernDto,
	) {
		try {
			const response = await this.clientService.updateSymptom(id, userId, dto);
			return new ApiSuccessResponseDto(
				response,
				HttpStatus.OK,
				'Symptom updated successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['successNull', 'notfound', 'authorize'], {
		message: 'Symptom deleted successfully',
	})
	@Delete('symptoms/:id')
	async deleteSymptom(@GetUser('sub') userId: string, @Param('id') id: string) {
		try {
			await this.clientService.deleteSymptom(id, userId);
			return new ApiSuccessResponseNoData(
				HttpStatus.OK,
				'Symptom deleted successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}
}
