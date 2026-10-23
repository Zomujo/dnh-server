import * as crypto from 'node:crypto';
import {
	Controller,
	Get,
	HttpStatus,
	Logger,
	Param,
	ParseFilePipeBuilder,
	Post,
	Query,
	UploadedFile,
	UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CustomApiResponse, GetUser } from '@/common/decorators';
import { ParseMongoIdPipe } from '@/common/decorators/validators/pipes';
import {
	ApiSuccessResponseDto,
	PaginatedDataResponseDto,
	throwError,
} from '@/common/utils/responses';
import { FirebaseService } from '@/core/firebase/firebase.service';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import {
	ChatMessageResponseDto,
	ChatPaginationQueryDto,
	ChatSessionDto,
	MediaUploadDto,
} from './dto';
import { MessageType } from './entities/message.entity';

@ApiTags('Chat')
@Controller('chat')
export class ChatController {
	private logger = new Logger(ChatController.name);
	private storageBucket: string;

	constructor(
		private readonly chatService: ChatService,
		private readonly firebaseService: FirebaseService,
		private readonly chatGateway: ChatGateway,
		private readonly configService: ConfigService,
	) {
		this.storageBucket = this.configService.get<string>('BASE_STORAGE_BUCKET')!;
	}

	@CustomApiResponse(['created', 'authorizeChronicCare'], {
		type: ChatMessageResponseDto,
		message: 'Media uploaded successfully',
	})
	@Post('hcp/rooms/:roomId/media')
	@ApiConsumes('multipart/form-data')
	@ApiBody({
		description: 'Media file to upload',
		type: MediaUploadDto,
	})
	@ApiQuery({
		name: 'parentMessageId',
		required: false,
		type: String,
		description: 'Optional parent message ID if this media is a reply',
	})
	@UseInterceptors(FileInterceptor('file'))
	async uploadMedia(
		@Param('roomId', ParseMongoIdPipe) roomId: string,
		@UploadedFile(
			new ParseFilePipeBuilder()
				.addMaxSizeValidator({ maxSize: 50 * 1024 * 1024 })
				.addFileTypeValidator({
					fileType: /(jpeg|jpg|png|gif|mp4|mpeg|m4a|mp3|quicktime|webm)$/i,
					errorMessage: `Unsupported filetype. Supported filetypes are: jpeg, jpg, png, gif, mp4, mpeg, m4a, mp3, quicktime, webm`,
				})
				.build(),
		)
		file: Express.Multer.File,
		@Query('parentMessageId') parentMessageId?: string,
		@GetUser('sub') userId?: string,
	) {
		try {
			return await this.handleMediaUpload(
				file,
				roomId,
				parentMessageId,
				userId,
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['created', 'authorize'], {
		type: ChatMessageResponseDto,
		message: 'Media uploaded successfully',
	})
	@Post('client/rooms/:roomId/media')
	@ApiConsumes('multipart/form-data')
	@ApiBody({
		description: 'Media file to upload',
		type: MediaUploadDto,
	})
	@ApiQuery({
		name: 'parentMessageId',
		required: false,
		type: String,
		description: 'Optional parent message ID if this media is a reply',
	})
	@UseInterceptors(FileInterceptor('file'))
	async uploadMediaClient(
		@Param('roomId', ParseMongoIdPipe) roomId: string,
		@UploadedFile(
			new ParseFilePipeBuilder()
				.addMaxSizeValidator({ maxSize: 50 * 1024 * 1024 })
				.addFileTypeValidator({
					fileType: /(jpeg|jpg|png|gif|mp4|mpeg|m4a|mp3|quicktime|webm)$/i,
				})
				.build(),
		)
		file: Express.Multer.File,
		@Query('parentMessageId') parentMessageId?: string,
		@GetUser('uid') userId?: string,
	) {
		try {
			return await this.handleMediaUpload(
				file,
				roomId,
				parentMessageId,
				userId,
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['paginated', 'authorizeChronicCare'], {
		type: ChatMessageResponseDto,
		message: 'Messages fetched successfully',
	})
	@Get('hcp/rooms/:roomId/messages')
	async getHistory(
		@Param('roomId', ParseMongoIdPipe) roomId: string,
		@GetUser('sub') personnelId: string,
		@Query() query: ChatPaginationQueryDto,
	) {
		try {
			const response = await this.chatService.getPaginatedMessages(
				roomId,
				personnelId,
				query,
			);
			const paginated = new PaginatedDataResponseDto(
				response.rows || [],
				query.page || 1,
				query.pageSize || 10,
				response.count,
			);
			return new ApiSuccessResponseDto(
				paginated,
				HttpStatus.OK,
				'Messages fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['paginated', 'authorize'], {
		type: ChatMessageResponseDto,
		message: 'Messages fetched successfully',
	})
	@Get('client/rooms/:roomId/messages')
	async getHistoryClient(
		@Param('roomId', ParseMongoIdPipe) roomId: string,
		@GetUser('uid') patientId: string,
		@Query() query: ChatPaginationQueryDto,
	) {
		try {
			const response = await this.chatService.getPaginatedMessages(
				roomId,
				patientId,
				query,
			);
			const paginated = new PaginatedDataResponseDto(
				response.rows || [],
				query.page || 1,
				query.pageSize || 10,
				response.count,
			);
			return new ApiSuccessResponseDto(
				paginated,
				HttpStatus.OK,
				'Messages fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['paginated', 'authorizeChronicCare'], {
		type: ChatSessionDto,
		message: 'Chat sessions fetched successfully',
	})
	@Get('hcp/sessions')
	async getHcpSessions(
		@GetUser('sub', ParseMongoIdPipe) personnelId: string,
		@Query() query: ChatPaginationQueryDto,
	) {
		try {
			const response = await this.chatService.listUserSessions(
				personnelId,
				'hcp',
				query,
			);
			const paginated = new PaginatedDataResponseDto(
				response.rows || [],
				query.page || 1,
				query.pageSize || 10,
				response.count,
			);
			return new ApiSuccessResponseDto(
				paginated,
				HttpStatus.OK,
				'Chat sessions fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	@CustomApiResponse(['paginated', 'authorize'], {
		type: ChatSessionDto,
		message: 'Chat sessions fetched successfully',
	})
	@Get('client/sessions')
	async getClientSessions(
		@GetUser('uid') patientId: string,
		@Query() query: ChatPaginationQueryDto,
	) {
		try {
			const response = await this.chatService.listUserSessions(
				patientId,
				'patient',
				query,
			);
			const paginated = new PaginatedDataResponseDto(
				response.rows || [],
				query.page || 1,
				query.pageSize || 10,
				response.count,
			);
			return new ApiSuccessResponseDto(
				paginated,
				HttpStatus.OK,
				'Chat sessions fetched successfully',
			);
		} catch (error) {
			throwError(this.logger, error);
		}
	}

	private async handleMediaUpload(
		file: Express.Multer.File,
		roomId: string,
		parentMessageId?: string,
		userId?: string,
	) {
		// Before touching Storage: a non-participant must not be able to
		// write files under the room's path or inject a message into it.
		await this.chatService.assertParticipant(roomId, userId);

		const uuidToken = crypto.randomUUID();
		const mime = file.mimetype;

		let folder: string;
		let messageType: MessageType;

		if (mime.startsWith('image/')) {
			folder = 'images';
			messageType = MessageType.IMAGE;
		} else if (mime.startsWith('video/')) {
			folder = 'videos';
			messageType = MessageType.VIDEO;
		} else {
			folder = 'audios';
			messageType = MessageType.AUDIO;
		}

		const storagePath = `hcp_chats/${roomId}/${folder}`;

		await this.firebaseService.uploadFile(file, storagePath, uuidToken);

		const fileUrl = `https://firebasestorage.googleapis.com/v0/b/${this.storageBucket}/o/${encodeURIComponent(storagePath + '/' + file.originalname)}?alt=media&token=${uuidToken}`;

		const savedMsg = await this.chatService.saveMessage(
			userId!,
			roomId,
			fileUrl,
			messageType,
			parentMessageId,
		);

		this.chatGateway.server.to(roomId).emit('newMessage', savedMsg);

		return new ApiSuccessResponseDto(
			savedMsg,
			HttpStatus.CREATED,
			'Media uploaded successfully',
		);
	}
}
