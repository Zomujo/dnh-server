import {
	Injectable,
	InternalServerErrorException,
	Logger,
	UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { differenceInYears } from 'date-fns';
import { Message } from 'firebase-admin/messaging';
import { OAuth2Client } from 'google-auth-library';
import { CacheService } from '@/core/caching/caching.service';
import { PatientsService } from '@/features/patients/patients.service';
import { FirebaseService } from '../firebase/firebase.service';
import {
	CreateAuthDto,
	LocalAuthUserPayload,
	OnboardDto,
	TestNotificationDto,
} from './dto';
import { UserType } from './enums';

// Chronic-care tokens are signed with a 1d lifetime (see JwtModule config in
// auth.module.ts). A revocation entry only needs to outlive the longest-lived
// token that could have existed before it was written, so this TTL mirrors
// that expiry — once it lapses, every token issued before the revocation has
// already expired on its own.
const CHRONIC_CARE_TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
	private logger = new Logger(AuthService.name);
	private googleClient: OAuth2Client;
	private readonly googleClientId: string;

	constructor(
		private firebaseService: FirebaseService,
		private jwtService: JwtService,
		private configService: ConfigService,
		private readonly patientsService: PatientsService,
		private readonly tokenDenylistCache: CacheService<number>,
	) {
		this.googleClientId = this.configService.get('GOOGLE_CLIENT_ID')!;
		this.googleClient = new OAuth2Client(this.googleClientId);
	}

	async signup(dto: CreateAuthDto) {
		const authUser = await this.firebaseService.auth.createUser({
			email: dto.email,
			emailVerified: false,
			disabled: false,
			password: dto.password,
			displayName: `${dto.email}`,
		});

		return authUser.uid;
	}

	async onboarding(userId: string, dto: OnboardDto) {
		// retriever user id and create patient in mongodb.
		let age = dto.age;
		let dateOfBirth = dto.dateOfBirth;

		if (dateOfBirth) {
			age = differenceInYears(new Date(), dateOfBirth);
		}

		const patientId = await this.patientsService.create({
			userId: userId,
			name: `${dto.firstname} ${dto.lastname}`,
			gender: dto.gender,
			dateOfBirth,
			age,
			chronicConditions: dto.chronicConditions,
			facility: dto.facility,
			phoneNumber: dto.phoneNumber,
		});
		// yearOfBirth: dto.yearOfBirth,
		// ghanaCardNumber: dto.ghanaCardNumber,
		// nhisNumber: dto.nhisNumber,

		return patientId;
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
		const payload = await this.jwtService.verifyAsync<LocalAuthUserPayload>(
			token,
			{
				audience: UserType.CHRONIC_CARE.toString(),
				issuer: this.configService.get<string>('JWT_TOKEN_ISSUER'),
			},
		);

		const revokedAt = await this.tokenDenylistCache.get(
			this.denylistKey(payload.sub),
		);
		if (revokedAt && payload.iat && payload.iat * 1000 < revokedAt) {
			throw new UnauthorizedException('Token revoked');
		}

		return payload;
	}

	/**
	 * Invalidates every chronic-care token already issued to this personnel
	 * (e.g. on account deletion) by recording the current time as their
	 * revocation cutoff — verifyChronicCareToken rejects any token whose
	 * `iat` predates it, regardless of how many tokens/devices are active.
	 */
	async revokePersonnelTokens(personnelId: string) {
		await this.tokenDenylistCache.set(
			this.denylistKey(personnelId),
			Date.now(),
			CHRONIC_CARE_TOKEN_LIFETIME_MS,
		);
	}

	private denylistKey(personnelId: string) {
		return `chronic-care-token-revoked:${personnelId}`;
	}

	async signToken<T>(
		userId: string,
		extras: { audience: string },
		payload?: T,
	) {
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
