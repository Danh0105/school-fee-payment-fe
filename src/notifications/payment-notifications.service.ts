import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotificationLog,
  NotificationChannel,
  NotificationStatus,
} from './entities/notification-log.entity';
import { ZaloZnsService } from './zalo-zns.service';
import { PaymentOrder } from '../payment-orders/entities/payment-order.entity';
import { PaymentOrdersService } from '../payment-orders/payment-orders.service';
import { StudentsService } from '../students/students.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { toZaloPhoneFormat } from '../common/utils/phone.util';

export interface NotifyResult {
  sent: boolean;
  recipientPhone: string;
  errorMessage?: string;
}

@Injectable()
export class PaymentNotificationsService {
  constructor(
    @InjectRepository(NotificationLog)
    private readonly logRepo: Repository<NotificationLog>,
    private readonly zaloZnsService: ZaloZnsService,
    private readonly paymentOrdersService: PaymentOrdersService,
    private readonly studentsService: StudentsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  /**
   * Sends the payment order's dynamic QR to the student's parent over Zalo
   * ZNS. Never lets a delivery failure surface as a 500 — it's logged and
   * returned as a normal (sent: false) result so the caller can retry or
   * fall back to another channel.
   */
  async notifyParentForOrder(
    paymentOrderId: string,
    actor: { userId: string },
  ): Promise<NotifyResult> {
    const order = await this.paymentOrdersService.findById(paymentOrderId);
    const student = await this.studentsService.findById(order.studentId);

    const phone = toZaloPhoneFormat(student.parentPhone ?? student.phone);
    if (!phone) {
      throw AppException.badRequest(ErrorCode.PARENT_PHONE_MISSING);
    }

    const templateData = this.buildTemplateData(order, student.fullName);

    const result = await this.zaloZnsService.sendTemplate(phone, templateData);

    const log = this.logRepo.create({
      channel: NotificationChannel.ZALO_ZNS,
      recipientPhone: phone,
      templateId: null,
      payload: templateData,
      status: result.success
        ? NotificationStatus.SENT
        : NotificationStatus.FAILED,
      providerMessageId: result.providerMessageId ?? null,
      errorMessage: result.errorMessage ?? null,
      referenceType: 'PaymentOrder',
      referenceId: order.id,
      sentBy: actor.userId,
    });
    await this.logRepo.save(log);

    await this.auditLogsService.record({
      userId: actor.userId,
      action: 'NOTIFY_PARENT_ZALO',
      entityType: 'PaymentOrder',
      entityId: order.id,
      newData: {
        phone,
        sent: result.success,
        errorMessage: result.errorMessage,
      },
    });

    return {
      sent: result.success,
      recipientPhone: phone,
      errorMessage: result.errorMessage,
    };
  }

  private buildTemplateData(
    order: PaymentOrder,
    studentName: string,
  ): Record<string, string> {
    return {
      student_name: studentName,
      order_code: order.orderCode,
      amount: order.requestedAmount.toFixed(0),
      qr_link: order.qrUrl ?? '',
    };
  }

  async findLogsByReference(
    referenceType: string,
    referenceId: string,
  ): Promise<NotificationLog[]> {
    return this.logRepo.find({
      where: { referenceType, referenceId },
      order: { createdAt: 'DESC' },
    });
  }
}
