import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ZaloOAuthToken } from './entities/zalo-oauth-token.entity';
import { NotificationLog } from './entities/notification-log.entity';
import { ZaloTokenService } from './zalo-token.service';
import { ZaloZnsService } from './zalo-zns.service';
import { PaymentNotificationsService } from './payment-notifications.service';
import { NotificationsController } from './notifications.controller';
import { PaymentOrdersModule } from '../payment-orders/payment-orders.module';
import { StudentsModule } from '../students/students.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ZaloOAuthToken, NotificationLog]),
    PaymentOrdersModule,
    StudentsModule,
  ],
  providers: [ZaloTokenService, ZaloZnsService, PaymentNotificationsService],
  controllers: [NotificationsController],
  exports: [PaymentNotificationsService],
})
export class NotificationsModule {}
