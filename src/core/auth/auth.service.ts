import {
	Injectable,
	InternalServerErrorException,
	Logger,
	UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Message } from 'firebase-admin/messaging';
import { OAuth2Client } from 'google-auth-library';
import { FirebaseService } from '../firebase/firebase.service';
import {
	CreateAuthDto,
	LocalAuthUserPayload,
	TestNotificationDto,
} from './dto';

@Injectable()
export class AuthService {
	private logger = new Logger(AuthService.name);
	private googleClient: OAuth2Client;
	private readonly googleClientId: string;

	constructor(
		private firebaseService: FirebaseService,
		private jwtService: JwtService,
		private configService: ConfigService,
	) {
		this.googleClientId = this.configService.get('GOOGLE_CLIENT_ID')!;
		this.googleClient = new OAuth2Client(this.googleClientId);
	}

	async login(dto: CreateAuthDto) {
		const { email, password } = dto;
		const idToken = `${email} ${password}`;
		this.logger.log('ID Token:', idToken);
		return { token: idToken };
	}

	findAll() {
		return `This action returns all auth`;
	}

	async testNotification(dto: TestNotificationDto) {
		// const topic = 'peerCounselling';
		// const token =
		// 'dFla11QPBkadqAREv0DMRa:APA91bH7o6RJfOZBKZq-vnM-odTmGdICz9G-VuFeu78HGnXhMtuCV-6ueb3kkkUcLlbL-Q5H8JLgVHqaOxJjcCemShNyziCwnl-ukvR6cl0Yart5jbV9S6w';
		const token = dto.fcmToken;
		// const message = {
		// 	notification: {
		// 		title: 'DH AI',
		// 		body: 'Hellooo. How are you doing today',
		// 	},
		// 	data: {
		// 		notification_type: 'dh_ai',
		// 	},
		// };
		// data: {
		//   notification_type: 'alert',
		// },

		// notification: {
		// },

		const message: Partial<Message> = {
			notification: {
				title: 'DH AI',
				body: 'Hellooo. How are you doing today',
			},
			data: {
				chat_id: dto.chatId,
				notification_type: dto.notificationType,
				click_action: 'FLUTTER_NOTIFICATION_CLICK',
			},
			android: {
				priority: 'high',
				notification: {
					channelId: 'high_importance_channel',
				},
			},
			apns: {
				payload: {
					aps: {
						sound: 'default',
						badge: 1,
						contentAvailable: true,
					},
				},
			},
		};

		try {
			const notification = await this.firebaseService.messaging.send({
				...message,
				token,
			});
			this.logger.log(`notification sent to token: ${token}`, notification);
			return { notification: message };
		} catch (error) {
			this.logger.log('Error sending message:', error);
			const message =
				error?.errorInfo?.message || error?.message || 'Internal server error';
			throw new InternalServerErrorException(message);
		}
	}

	async verifyChronicCareToken(token: string) {
		const payload =
			await this.jwtService.verifyAsync<LocalAuthUserPayload>(token);
		return payload;
	}

	async signToken<T>(
		userId: string,
		extras: { audience: string },
		payload?: T,
	) {
		console.log('payload', payload);
		return await this.jwtService.signAsync(
			{
				sub: userId,
				...payload,
			},
			{
				audience: extras.audience,
				issuer: this.configService.get<string>('JWT_TOKEN_ISSUER'),
			},
		);
	}

	async googleLogin(idToken: string) {
		if (!idToken) {
			throw new UnauthorizedException('Google ID Token is missing.');
		}
		try {
			const ticket = await this.googleClient.verifyIdToken({
				idToken: idToken,
				audience: this.googleClientId,
			});

			const payload = ticket.getPayload();
			if (!payload || !payload.email) {
				throw new UnauthorizedException('Invalid ID Token payload.');
			}
			return payload;
		} catch (error) {
			const stack = error instanceof Error ? error.stack : String(error);
			this.logger.error('Google ID Token verification failed', stack);
			throw new UnauthorizedException('Token verification failed.');
		}
	}

	async test() {
		await this.firebaseService.updateDoc(
			'leaderboard_stats',
			'domeyeben4@gmail.com',
			{
				'points.day': 10,
			},
		);
	}

	remove(id: string) {
		return `This action removes a #${id} auth`;
	}
}
