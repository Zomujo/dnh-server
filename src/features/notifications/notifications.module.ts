import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DhVectorsModule } from '../dh-vectors/dh-vectors.module';
import {
	AugurNotification,
	AugurNotificationSchema,
} from './entities/notification.entity';
import { UserToken, UserTokenSchema } from './entities/user-tokens.entity';
import { NotificationsConsumer } from './notifications.consumer';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushService } from './push/push.service';

@Module({
	controllers: [NotificationsController],
	providers: [NotificationsService, NotificationsConsumer, PushService],
	imports: [
		MongooseModule.forFeature([
			{ name: AugurNotification.name, schema: AugurNotificationSchema },
			{ name: UserToken.name, schema: UserTokenSchema },
		]),
		BullModule.registerQueue({ name: AugurNotification.name }),
		DhVectorsModule,
	],
	exports: [NotificationsService],
})
export class AugurNotificationsModule {}
