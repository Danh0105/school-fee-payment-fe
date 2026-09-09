import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Decimal from 'decimal.js';
import { PaymentOrder } from './entities/payment-order.entity';
import { PaymentOrderItem } from './entities/payment-order-item.entity';
import { CreatePaymentOrderDto } from './dto/create-payment-order.dto';
import { ReceivablesService } from '../receivables/receivables.service';
import { SchoolsService } from '../schools/schools.service';
import { StudentsService } from '../students/students.service';
import { PaymentProvidersService } from '../payment-providers/payment-providers.service';
import { SequenceService } from '../database/sequence.service';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import {
  PaymentMethod,
  PaymentOrderStatus,
  PaymentProviderCode,
  ReceivableStatus,
} from '../common/enums/status.enum';

@Injectable()
export class PaymentOrdersService {
  constructor(
    @InjectRepository(PaymentOrder)
    private readonly repo: Repository<PaymentOrder>,
    private readonly dataSource: DataSource,
    private readonly receivablesService: ReceivablesService,
    private readonly schoolsService: SchoolsService,
    private readonly studentsService: StudentsService,
    private readonly paymentProvidersService: PaymentProvidersService,
    private readonly sequenceService: SequenceService,
    private readonly config: ConfigService,
  ) {}

  async create(
    dto: CreatePaymentOrderDto,
    userId?: string,
  ): Promise<PaymentOrder> {
    const student = await this.studentsService.findById(dto.studentId);
    const school = await this.schoolsService.findById(student.schoolId);

    const receivables = await Promise.all(
      dto.items.map((item) =>
        this.receivablesService.findById(item.receivableId),
      ),
    );

    const itemInputs = dto.items.map((item, idx) => {
      const receivable = receivables[idx];
      if (receivable.studentId !== dto.studentId) {
        throw AppException.badRequest(
          ErrorCode.VALIDATION_ERROR,
          'Khoản công nợ không thuộc về học sinh này',
        );
      }
      if (receivable.status === ReceivableStatus.CANCELLED) {
        throw AppException.badRequest(ErrorCode.RECEIVABLE_CANCELLED);
      }
      if (receivable.status === ReceivableStatus.PAID) {
        throw AppException.badRequest(ErrorCode.RECEIVABLE_ALREADY_PAID);
      }
      const amount = item.amount
        ? new Decimal(item.amount)
        : receivable.amountOutstanding;
      if (amount.lte(0) || amount.gt(receivable.amountOutstanding)) {
        throw AppException.badRequest(
          ErrorCode.PAYMENT_AMOUNT_INVALID,
          `Số tiền yêu cầu cho khoản công nợ ${receivable.receivableCode} không hợp lệ`,
        );
      }
      return { receivableId: receivable.id, amount };
    });

    const requestedAmount = itemInputs.reduce(
      (sum, i) => sum.plus(i.amount),
      new Decimal(0),
    );

    const now = new Date();
    const dateScope = `${now.getFullYear().toString().slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate(),
    ).padStart(2, '0')}`;
    const orderCode = await this.sequenceService.generateCode(
      `PAY${dateScope}`,
      `PAYMENT_ORDER:${school.id}:${dateScope}`,
      6,
    );

    const paymentMethod = dto.paymentMethod ?? PaymentMethod.VIETQR;
    let qrPayload: string | null = null;
    let qrUrl: string | null = null;

    if (
      paymentMethod === PaymentMethod.VIETQR ||
      paymentMethod === PaymentMethod.BANK_TRANSFER
    ) {
      if (school.bankCode && school.bankAccountNumber) {
        const providerCode =
          paymentMethod === PaymentMethod.VIETQR
            ? PaymentProviderCode.VIETQR
            : PaymentProviderCode.MANUAL_BANK;
        const provider = this.paymentProvidersService.get(providerCode);
        const qr = provider.createQr({
          bankCode: school.bankCode,
          bankAccountNumber: school.bankAccountNumber,
          bankAccountName: school.bankAccountName ?? school.name,
          amount: requestedAmount,
          transferContent: orderCode,
        });
        qrPayload = qr.qrPayload;
        qrUrl = qr.qrUrl;
      }
    }

    const expiresMinutes =
      this.config.get<number>('payment.orderExpiresMinutes') ?? 60;
    const expiresAt = new Date(now.getTime() + expiresMinutes * 60_000);

    return this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(PaymentOrder);
      const itemRepo = manager.getRepository(PaymentOrderItem);

      const order = orderRepo.create({
        schoolId: school.id,
        studentId: student.id,
        orderCode,
        requestedAmount,
        status: PaymentOrderStatus.PENDING,
        paymentMethod,
        bankCode: school.bankCode,
        bankAccountNumber: school.bankAccountNumber,
        transferContent: orderCode,
        qrPayload,
        qrUrl,
        expiresAt,
        createdBy: userId ?? null,
      });
      const savedOrder = await orderRepo.save(order);

      const items = itemInputs.map((i) =>
        itemRepo.create({
          paymentOrderId: savedOrder.id,
          receivableId: i.receivableId,
          requestedAmount: i.amount,
        }),
      );
      savedOrder.items = await itemRepo.save(items);

      return savedOrder;
    });
  }

  async findById(id: string): Promise<PaymentOrder> {
    const order = await this.repo.findOne({
      where: { id },
      relations: { items: { receivable: true }, student: true },
    });
    if (!order) throw AppException.notFound(ErrorCode.PAYMENT_ORDER_NOT_FOUND);
    return order;
  }

  async findByOrderCode(
    orderCode: string,
    manager?: EntityManager,
  ): Promise<PaymentOrder | null> {
    const repo = manager ? manager.getRepository(PaymentOrder) : this.repo;
    return repo.findOne({ where: { orderCode }, relations: { items: true } });
  }

  async getQr(id: string): Promise<{
    qrPayload: string | null;
    qrUrl: string | null;
    expiresAt: Date | null;
    status: PaymentOrderStatus;
  }> {
    const order = await this.findById(id);
    if (
      order.status === PaymentOrderStatus.PENDING &&
      order.expiresAt &&
      order.expiresAt < new Date()
    ) {
      order.status = PaymentOrderStatus.EXPIRED;
      await this.repo.save(order);
    }
    return {
      qrPayload: order.qrPayload,
      qrUrl: order.qrUrl,
      expiresAt: order.expiresAt,
      status: order.status,
    };
  }
}
