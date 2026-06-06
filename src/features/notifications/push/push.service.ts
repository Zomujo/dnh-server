import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Message, Messaging } from 'firebase-admin/messaging';
import { Model } from 'mongoose';
import { UserType } from '@/core/auth/enums';
import { FirebaseService } from '@/core/firebase/firebase.service';
import { IUserPayload } from '@/core/firebase/interface/user.interface';
import {
	AugurSendNotificationDto,
	CreatePushDto,
	PushToTopicDto,
} from '../dto';
import { UserToken } from '../entities/user-tokens.entity';

@Injectable()
export class PushService {
	private logger = new Logger(PushService.name);
	constructor(
		@InjectModel(UserToken.name) private userTokenModel: Model<UserToken>,
		private firebaseService: FirebaseService,
	) {}

	async addFcmToken(dto: CreatePushDto, user: IUserPayload) {
		await this.userTokenModel.updateOne(
			{ userId: user.sub },
			{ ...dto, userId: user.sub, userType: user.aud },
			{ upsert: true },
		);
		return;
	}

	async sendAugurNotification(dto: AugurSendNotificationDto) {
		const { userId, title, body } = dto;

		const tokens = await this.userTokenModel
			.find({ userId })
			.select('fcmToken')
			.sort({ updatedAt: -1 })
			.limit(7)
			.lean();

		const fcmTokens = tokens.map((token) => token.fcmToken);

		// const token = fcmToken;
		const message: Partial<Message> = {
			notification: {
				title,
				body,
			},
			data: {
				notification_type: 'zyptyk_ai',
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
		// const message = {
		// 	data: {
		// 		title,
		// 		body,
		// 		actionId: payload.actionId || 'chronic_actions',
		// 		notification_type: payload.notification_type || 'actionBtns',
		// 		actionBtn1Display: payload.actionBtn1Display || 'Yes',
		// 		actionBtn1Payload: payload.actionBtn1Payload || 'yes',
		// 		actionBtn1Endpoint:
		// 			payload.actionBtn1Endpoint ||
		// 			'/chronic-care/doctors/medications/receive-choice',
		// 		actionBtn2Display: payload.actionBtn2Display || 'No',
		// 		actionBtn2Payload: payload.actionBtn2Payload || 'no',
		// 		actionBtn2Endpoint:
		// 			payload.actionBtn2Endpoint ||
		// 			'/chronic-care/doctors/medications/receive-choice',
		// 	},
		// };

		await this.pushNotification(
			fcmTokens,
			message,
			userId,
			this.firebaseService.messaging,
		);
		// this.logger.log('Mocking notification sent', {
		// 	fcmTokens,
		// 	message,
		// 	userId,
		// });
	}

	async testActionNotification(dto: CreatePushDto) {
		// const topic = 'peerCounselling';
		// const token =
		// 'dFla11QPBkadqAREv0DMRa:APA91bH7o6RJfOZBKZq-vnM-odTmGdICz9G-VuFeu78HGnXhMtuCV-6ueb3kkkUcLlbL-Q5H8JLgVHqaOxJjcCemShNyziCwnl-ukvR6cl0Yart5jbV9S6w';
		const token = dto.fcmToken;
		const message = {
			// notification: {
			// 	title: 'Hello User',
			// 	body: 'Have you taken your medication today?',
			// },
			data: {
				title: 'hello user',
				// body: 'good afternoon, zigah mawuli. have you taken your amlodipine?',
				body: 'have you taken your medication today?',
				actionid: 'chronic_actions',
				notification_type: 'actionbtns',
				actionbtn1display: 'yes',
				actionbtn1payload: 'yes',
				actionbtn1endpoint:
					'/chronic-care/doctors/medications/receive-choice?id=6989d318c0adbeb8f2bc1460',
				actionbtn2display: 'no',
				actionbtn2payload: 'no',
				actionbtn2endpoint:
					'/chronic-care/doctors/medications/receive-choice?id=6989d318c0adbeb8f2bc1460',
			},
		};
		// data: {
		//   notification_type: 'alert',
		// },

		try {
			const notification = await this.firebaseService.messaging.send({
				...message,
				token,
			});
			this.logger.log(`notification sent to token:${token}`);
			console.log(notification);
		} catch (error) {
			this.logger.log('Error sending message:', error);
		}
		return message;
	}

	async sendTopicNotification(dto: PushToTopicDto) {
		const topic = dto.topic;
		const message: Partial<Message> = {
			notification: {
				title: dto.title,
				body: dto.messsage,
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
			await this.firebaseService.messaging.send({
				...message,
				topic,
			});
			this.logger.log(`notification sent to topic:${topic}`);
		} catch (error) {
			this.logger.error('Error sending topic message:', error);
		}
		return message;
	}

	async removeFcmToken(dto: CreatePushDto) {
		const userToken = await this.userTokenModel.findOneAndDelete({
			fcmToken: dto.fcmToken,
		});
		if (!userToken) {
			throw new NotFoundException('FCM token not found');
		}
		return;
	}

	async sendNotification(
		getMessage: () => Partial<Message>,
		userId: string,
		notificationType?: string,
	) {
		try {
			const userTokens = await this.userTokenModel
				.find({ userId })
				.select('fcmToken userType');

			const fcmTokens = userTokens.map((userToken) => userToken.fcmToken);

			if (fcmTokens.length === 0) {
				this.logger.warn(`No FCM tokens found for user ${userId}`);
				return;
			}

			let messagingProject: Messaging;
			switch (userTokens[0].userType) {
				case UserType.DEV:
				case UserType.DH_CLIENTS:
					messagingProject = this.firebaseService.messaging;
					break;
				default:
					throw new Error('user type does not exist');
			}

			const message = getMessage();

			const createdAt = Date.now();
			if (notificationType) {
				await this.upsertNotificationFirebase(
					message,
					userId,
					createdAt,
					notificationType,
				);
			}
			await this.pushNotification(fcmTokens, message, userId, messagingProject);
		} catch (error) {
			this.logger.error('Error fetching user FCM tokens', error);
		}
	}

	async sendNotificationToTopic(
		getMessage: () => Partial<Message>,
		topic: string,
	) {
		try {
			const message = getMessage();
			const messaging = this.firebaseService.messaging;
			await this.pushNotificationToTopic(topic, message, messaging);
		} catch (error) {
			this.logger.error(
				'An error occured with sending a notification to topic:',
				error,
			);
		}
	}

	async pushActionNotification(
		fcmTokens: string[],
		message: Partial<Message>,
		userId: string,
		messaging: Messaging,
	) {
		for (const token of fcmTokens) {
			try {
				const response = await messaging.send({ ...message, token });
				this.logger.log(`Notification Message:`, message);
				this.logger.log(
					`Notification sent successfully: ${response}`,
					response,
				);
			} catch (error: any) {
				if (
					error.code === 'messaging/invalid-registration-token' ||
					error.code === 'messaging/registration-token-not-registered' ||
					error.message ===
						'The registration token is not a valid FCM registration token'
				) {
					this.logger.debug(
						`Removing invalid FCM token for user ${userId}: ${token}`,
					);
					await this.userTokenModel.deleteOne({
						userId,
						fcmToken: token,
					});
				} else {
					this.logger.error('Error sending notification:', error);
				}
			}
		}
	}

	async pushNotification(
		fcmTokens: string[],
		message: Partial<Message>,
		userId: string,
		messaging: Messaging,
	) {
		for (const token of fcmTokens) {
			try {
				const response = await messaging.send({
					...message,
					token,
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
				});
				this.logger.debug(`Token: ${token} Notification Message:`, message);
				this.logger.debug(
					`Notification sent successfully: ${response}`,
					response,
				);
			} catch (error: any) {
				if (
					error.code === 'messaging/invalid-registration-token' ||
					error.code === 'messaging/registration-token-not-registered' ||
					error.message ===
						'The registration token is not a valid FCM registration token'
				) {
					this.logger.debug(
						`Removing invalid FCM token for user ${userId}: ${token}`,
					);
					await this.userTokenModel.deleteOne({
						userId,
						fcmToken: token,
					});
				} else {
					this.logger.error('Error sending notification:', error);
				}
			}
		}
	}

	async pushNotificationToTopic(
		topic: string,
		message: Partial<Message>,
		messaging: Messaging,
	) {
		try {
			const response = await messaging.send({ ...message, topic });
			this.logger.log(`Notification Message:`, message);
			this.logger.log(
				`Notification sent successfully to topic ${topic} : ${response}`,
				response,
			);
		} catch (error: any) {
			this.logger.error('Error sending notification to topic:', error);
		}
	}

	private async upsertNotificationFirebase(
		message: Partial<Message>,
		userId: string,
		createdAt: number,
		notificationType: string,
	) {
		this.firebaseService.db
			.collection('clients')
			.doc(userId)
			.collection('notifications')
			.add({
				createdAt,
				title: message.notification?.title,
				message: message.notification?.body,
				type: notificationType,
				is_read: false,
				read_at: 0,
				image: null,
			});

		this.logger.log(
			`Added ${message.notification?.title} notification to Firebase`,
		);
	}
}
