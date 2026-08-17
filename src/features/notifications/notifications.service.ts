import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Queue, RepeatOptions } from 'bullmq';
import { subHours } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { Model, Types } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';
import { generateFilter } from '@/common/factory';
import { IUserPayload } from '@/core/firebase/interface/user.interface';
import { DhVectorsService } from '../dh-vectors/dh-vectors.service';
import { DHDocumentType } from '../dh-vectors/dto';
import {
	CreateNotificationDto,
	CreatePushDto,
	FilterNotificationsDto,
	Frequency,
	NotificationFilterDto,
	RepetitionType,
	UpdateNotificationDto,
	UpsertNotificationDto,
} from './dto';
import { AugurNotification } from './entities/notification.entity';
import { PushService } from './push/push.service';

@Injectable()
export class NotificationsService {
	private logger = new Logger(NotificationsService.name);

	constructor(
		@InjectModel(AugurNotification.name)
		private readonly notificationModel: Model<AugurNotification>,
		@InjectQueue(AugurNotification.name)
		private readonly notificationQueue: Queue,
		private readonly dhVectorsService: DhVectorsService,
		private readonly pushService: PushService,
	) {}

	async addFcmToken(dto: CreatePushDto, user: IUserPayload) {
		await this.pushService.addFcmToken(dto, user);
	}

	async removeFcmToken(dto: CreatePushDto, userId: string) {
		await this.pushService.removeFcmToken(dto, userId);
	}

	async create(dto: CreateNotificationDto) {
		const jobId = crypto.randomUUID();
		const qdrantId = uuidv7();

		const notification = await this.notificationModel.create({
			...dto,
			patient: dto.patient as any,
			queueJobId: jobId,
			qdrantId,
		});

		const summary = this.generateNotificationSummary(notification);

		await this.dhVectorsService.create({
			qdrantId: notification.qdrantId,
			userId: notification.userId,
			patient: notification.patient as any,
			documentType: DHDocumentType.NOTIFICATION,
			documentId: notification._id.toString(),
			summary,
		});

		const notificationId = notification._id;

		await this.upsertJob(notification, jobId);

		return notificationId;
	}

	async findAll(query: FilterNotificationsDto) {
		const projection = [
			'notificationType',
			'channel',
			'goal',
			'priority',
			'frequency',
			'startDate',
			'createdAt',
			'updatedAt',
		];
		const { pageFilter, searchFilter } = generateFilter(query, projection);
		const notifications = await this.notificationModel
			.find({ patient: query.patientId, ...searchFilter })
			.skip(pageFilter.offset)
			.limit(pageFilter.limit)
			.sort(pageFilter.orderBy)
			.select(projection);

		const count = await this.notificationModel.countDocuments({
			patient: query.patientId,
			...searchFilter,
		});

		return { rows: notifications, count };
	}

	async findOne(id: string) {
		const notification = await this.notificationModel
			.findById(id)
			.populate({ path: 'patient', select: 'name phoneNumber timezone' });

		if (!notification) {
			throw new NotFoundException('Notification not found');
		}
		return notification;
	}

	async update(id: string, dto: UpdateNotificationDto) {
		const notification = await this.notificationModel.findByIdAndUpdate(
			id,
			{ ...dto },
			{ returnDocument: 'after' },
		);
		if (!notification) {
			throw new NotFoundException('Notification not found');
		}

		const summary = this.generateNotificationSummary(notification);

		await this.dhVectorsService.create({
			qdrantId: notification.qdrantId,
			userId: notification.userId,
			patient: notification.patient as any,
			documentType: DHDocumentType.NOTIFICATION,
			documentId: notification._id.toString(),
			summary,
		});

		await this.upsertJob(notification, notification.queueJobId);

		return notification._id;
	}

	async upsertNotification(
		filters: NotificationFilterDto,
		dto: UpsertNotificationDto,
	) {
		const qdrantId = uuidv7();
		const jobId = crypto.randomUUID().toString();

		const query = this.generateNotificationSummary({
			targetType: dto.targetType,
			targetName: dto.targetName,
			goal: filters.goal,
		});
		const searchNotification = await this.dhVectorsService.findAll({
			userId: filters.userId,
			patient: filters.patient,
			documentType: DHDocumentType.NOTIFICATION,
			query,
		});

		const whereConditions: Record<string, any> = {};
		if (!searchNotification.length) {
			whereConditions.patient = filters.patient;
			whereConditions.notificationType = filters.notificationType;
			whereConditions.targetType = new RegExp(`^${dto.targetType}$`, 'i');
			whereConditions.targetName = new RegExp(`^${dto.targetName}$`, 'i');
		} else {
			whereConditions._id = new Types.ObjectId(
				searchNotification[0].item.documentId,
			);
		}

		const notification = await this.notificationModel.findOneAndUpdate(
			whereConditions,
			{
				$set: { ...dto },
				$setOnInsert: { qdrantId, queueJobId: jobId },
			},
			{ returnDocument: 'after', upsert: true },
		);

		const summary = this.generateNotificationSummary(notification);

		await this.dhVectorsService.create({
			qdrantId: notification.qdrantId,
			userId: filters.userId,
			patient: filters.patient,
			documentType: DHDocumentType.NOTIFICATION,
			documentId: notification._id.toString(),
			summary,
		});

		await this.upsertJob(notification, notification.queueJobId);

		return notification._id;
	}

	async remove(id: string) {
		const notification = await this.notificationModel.findByIdAndDelete(id);
		if (!notification) {
			throw new NotFoundException('Notification not found');
		}
		await this.removeNotificationJob(notification.queueJobId);

		return;
	}

	private async upsertJob(notification: AugurNotification, jobId: string) {
		const outcome = await this.removeNotificationJob(notification.queueJobId);
		this.logger.log('remove outcome', outcome);

		await this.addJob(
			notification.queueJobId ?? jobId,
			{ notification: notification.toJSON() },
			{
				startDate: notification.startDate,
				frequency: notification.frequency,
				endDate: notification.endDate,
				timezone: notification.timezone,
			},
		);

		const scheduler = await this.notificationQueue.getJobScheduler(
			notification.queueJobId ?? jobId,
		);

		if (scheduler) {
			notification.toBeNotifiedAt = new Date(scheduler.next!);
		}

		if (!notification.queueJobId) {
			notification.queueJobId = jobId;
		}
		await notification.save();
	}

	private generateNotificationSummary(
		notification: Partial<AugurNotification>,
	): string {
		const parts: string[] = [];

		// 1. Core Purpose & Type
		if (notification.notificationType || notification.targetName) {
			const type = notification.notificationType || 'notification';
			const target = notification.targetName
				? ` regarding ${notification.targetName}`
				: '';
			const targetType = notification.targetType
				? ` (${notification.targetType})`
				: '';
			parts.push(
				`${type.charAt(0).toUpperCase() + type.slice(1)}: Set for ${target}${targetType}.`,
			);
		}

		// 2. Schedule & Frequency
		if (
			notification.startDate ||
			notification.timeOfDay ||
			notification.frequency
		) {
			const start = notification.startDate
				? ` starting from ${new Date(
						notification.startDate,
					).toLocaleDateString()}`
				: '';
			const time = notification.timeOfDay
				? ` at ${notification.timeOfDay}`
				: '';
			let freqStr = '';
			if (notification.frequency) {
				const { repeatEvery, repetitionType } = notification.frequency;
				freqStr = `, repeating every ${repeatEvery} ${repetitionType.toLowerCase()}`;
			}
			parts.push(`Schedule: Active${start}${time}${freqStr}.`);
		}

		// 3. Goal & Priority
		if (notification.goal || notification.priority) {
			const goal = notification.goal ? ` Objective: ${notification.goal}.` : '';
			const priority = notification.priority
				? ` Priority level: ${notification.priority}.`
				: '';
			parts.push(`Management:${goal}${priority}`);
		}

		// 4. Delivery & Tone
		if (notification.channel || notification.tone) {
			const channel = notification.channel
				? ` Delivered via ${notification.channel}`
				: 'Delivered';
			const tone = notification.tone ? ` with a ${notification.tone} tone` : '';
			parts.push(`Delivery: ${channel}${tone}.`);
		}

		// 5. Constraints
		if (notification.constraints && notification.constraints.length > 0) {
			parts.push(`Constraints: ${notification.constraints.join(', ')}.`);
		}

		if (notification.createdAt && notification.updatedAt) {
			parts.push(
				`Notification Created At: ${new Date(
					notification.createdAt,
				).toLocaleString()} and Updated At: ${new Date(
					notification.updatedAt,
				).toLocaleString()}`,
			);
		}

		return parts.join(' ');
	}

	private async addJob(
		jobId: string,
		data: Record<string, any>,
		dto: {
			startDate: Date;
			frequency?: Frequency;
			endDate?: Date;
			timezone?: string;
		},
	) {
		const timezone = dto.timezone ?? 'Africa/Accra';
		const repeatOpts: Omit<RepeatOptions, 'key'> = {
			tz: timezone,
			startDate:
				dto.startDate < new Date()
					? dto.startDate
					: subHours(dto.startDate, 12),
		};

		if (dto.frequency) {
			repeatOpts.pattern = this.getCron(dto.frequency, dto.startDate, timezone);
		}
		if (dto.endDate) {
			repeatOpts.endDate = dto.endDate;
		}

		return await this.notificationQueue.upsertJobScheduler(jobId, repeatOpts, {
			name: 'notify',
			data,
		});
	}

	private async removeNotificationJob(jobId: string) {
		// await this.notificationQueue.drain(true);
		// const [scheduleType, key, _next] = jobId.split(':');
		const job = await this.notificationQueue.getJob(jobId);

		if (job && !job.id!.toString().includes('repeat:')) {
			await job.remove();
			return { removed: true, type: 'regular', jobId };
		}

		// Direct lookup by id instead of fetching every scheduler in the queue
		// and scanning for a match — this runs on every notification write.
		const scheduler = await this.notificationQueue.getJobScheduler(jobId);

		if (scheduler) {
			await this.notificationQueue.removeJobScheduler(jobId);
			return {
				removed: true,
				type: 'repeateable',
				schedulerKey: jobId,
			};
		}

		return {
			removed: false,
			message: `No job or scheduler found for ID: ${jobId}`,
		};
	}

	async purgeNotifications(patientId: string) {
		const notifications = await this.notificationModel
			.find({ patient: patientId })
			.select('_id');

		await Promise.allSettled(
			notifications.map((notification) =>
				this.remove(notification._id.toString()),
			),
		);
	}

	private getCron(
		frequency: Frequency,
		startDate: Date,
		timezone: string,
	): string {
		const { repeatEvery, repetitionType } = frequency;

		if (repeatEvery < 1) {
			throw new Error('repeatEvery must be at least 1');
		}

		// BullMQ's repeatOpts.tz tells the cron parser to interpret this
		// pattern's fields as wall-clock time in `timezone` — so the fields
		// must actually be extracted in that timezone, not raw UTC. Using
		// getUTC*() here would only coincidentally be correct for a
		// UTC+0 timezone (e.g. Africa/Accra); any other timezone would fire
		// reminders at the wrong local hour.
		const start = toZonedTime(startDate, timezone);
		const sec = start.getSeconds();
		const min = start.getMinutes();
		const hour = start.getHours();
		const day = start.getDate();
		const month = start.getMonth() + 1;
		const weekday = start.getDay();

		switch (repetitionType) {
			case RepetitionType.HOURLY: {
				return `${sec} ${min} */${repeatEvery} * * *`;
			}

			case RepetitionType.DAILY: {
				if (repeatEvery === 1) {
					return `${sec} ${min} ${hour} * * *`;
				}
				// Doses are spread evenly across a 12-hour window starting at
				// `hour`, listed explicitly rather than encoded as a cron `/N`
				// step — a step pattern repeats across the full 24h day
				// regardless of the intended 12h window, silently firing more
				// often than repeatEvery (e.g. repeatEvery=3 with a 6h step
				// fires 4x/day: hour, +6, +12, +18 — not the intended 3x).
				const intervalHours = Math.max(1, Math.floor(12 / (repeatEvery - 1)));
				const hours: number[] = [];
				for (let i = 0; i < repeatEvery; i++) {
					hours.push((hour + i * intervalHours) % 24);
				}
				return `${sec} ${min} ${hours.join(',')} * * *`;
			}

			case RepetitionType.WEEKLY: {
				// Floors to 0 once repeatEvery > 7, which would turn the loop
				// below into an infinite `+= 0` — clamp to 1 so it's always
				// bounded, regardless of what validation allows through.
				const weekInterval = Math.max(1, Math.floor(7 / repeatEvery));
				const days: number[] = [];
				for (let i = 0; i < 7; i += weekInterval) {
					days.push((weekday + i) % 7);
				}
				return `${sec} ${min} ${hour} * * ${days.join(',')}`;
			}

			case RepetitionType.MONTHLY: {
				// Same infinite-loop risk as WEEKLY once repeatEvery > 30.4375.
				const daysInMonth = Math.max(1, Math.floor(30.4375 / repeatEvery));
				const monthDays: number[] = [];
				for (let d = day; d <= 31; d += daysInMonth) {
					monthDays.push(d);
				}
				return `${sec} ${min} ${hour} ${monthDays.join(',')} * *`;
			}

			case RepetitionType.YEARLY: {
				// Same infinite-loop risk as WEEKLY once repeatEvery > 12.
				const monthInterval = Math.max(1, Math.floor(12 / repeatEvery));
				const months: number[] = [];
				for (let m = month; m <= 12; m += monthInterval) {
					months.push(m);
				}
				return `${sec} ${min} ${hour} ${day} ${months.join(',')} *`;
			}

			default: {
				throw new Error(`Invalid repetition type: ${repetitionType}`);
			}
		}
	}
}
