import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Decimal from 'decimal.js';
import { EntityManager, IsNull } from 'typeorm';
import {
  BillingType,
  FeeCategoryStatus,
  FeePlanStatus,
  PaymentMethod,
  PaymentOrderStatus,
} from '../common/enums/status.enum';
import { toVietQrText, truncateVietQrText } from '../common/utils/vietqr.util';
import { ViettinbankProvider } from '../payment-providers/providers/viettinbank.provider';
import { SequenceService } from '../database/sequence.service';
import { FeeCategory } from '../fee-categories/entities/fee-category.entity';
import { FeePlan } from '../fee-plans/entities/fee-plan.entity';
import { PaymentOrder } from '../payment-orders/entities/payment-order.entity';
import { PaymentOrderItem } from '../payment-orders/entities/payment-order-item.entity';
import { ParsedImportRow } from './entities/import-session.entity';

/** Category holding the fee plans created for imported payment lists. */
export const PAYMENT_LIST_FEE_CATEGORY = 'Thu theo danh sách';

/**
 * Transfer content of a payment-list row: the list's NỘI DUNG column, else
 * "HV<identifier> <school> Lớp <class> <name>".
 */
export function rowTransferContent(
  row: Pick<
    ParsedImportRow,
    | 'legacyTransferContent'
    | 'identifierCode'
    | 'studentCode'
    | 'rowNumber'
    | 'className'
    | 'fullName'
  >,
  schoolCode: string,
): string {
  const className = row.className.replace(/^lớp\s+/iu, '').trim();
  return (
    row.legacyTransferContent?.trim() ||
    [
      `HV${row.identifierCode ?? row.studentCode ?? row.rowNumber}`,
      schoolCode,
      `Lớp ${className}`,
      row.fullName,
    ]
      .filter(Boolean)
      .join(' ')
  );
}

/** Last moment of a YYYY-MM-DD date in Vietnam time; null means no expiry. */
export function qrExpiryInstant(date: string | null): Date | null {
  return date ? new Date(`${date}T23:59:59+07:00`) : null;
}

/** Order code and VietinBank dynamic QR drawn for a row before saving. */
export interface PreparedOrderQr {
  orderCode: string;
  /** VAV: the order's key inside VietinBank's virtual account (VAC + VAV). */
  transferContent: string;
  /** The virtual account the parent pays: money lands on the company account. */
  accountNumber: string;
  qrPayload: string;
  qrUrl: string | null;
}

/** EMV field 38 → 01 → 00 → 01: the beneficiary account inside a VietQR payload. */
function accountInVietQr(payload: string): string | null {
  const fields = (value: string): Record<string, string> => {
    const out: Record<string, string> = {};
    for (let i = 0; i + 4 <= value.length;) {
      const length = Number(value.slice(i + 2, i + 4));
      if (Number.isNaN(length)) break;
      out[value.slice(i, i + 2)] = value.slice(i + 4, i + 4 + length);
      i += 4 + length;
    }
    return out;
  };
  const merchant = fields(payload)['38'];
  const consumer = merchant ? fields(merchant)['01'] : undefined;
  const beneficiary = consumer ? fields(consumer)['00'] : undefined;
  return beneficiary ? (fields(beneficiary)['01'] ?? null) : null;
}

/**
 * Debts and payment orders for an imported payment list ("danh sách thu").
 * Each order is paid through a VietinBank virtual account (dynamic QR), so
 * the money reaches the company account and VietinBank's notify-bill clears
 * the debt; the school needs no bank account of its own.
 */
@Injectable()
export class ImportPaymentOrdersService {
  constructor(
    private readonly sequenceService: SequenceService,
    private readonly viettinbankProvider: ViettinbankProvider,
    private readonly config: ConfigService,
  ) {}

  assertVietinbankConfigured(): void {
    if (!this.config.get<string>('viettinbank.account')) {
      throw new BadRequestException(
        'Chưa cấu hình tài khoản VietinBank (VIETINBANK_ACCOUNT) để tạo mã QR động',
      );
    }
  }

  /** Holder of the collection account, printed as "Đơn vị thụ hưởng". */
  beneficiaryName(fallback: string): string {
    return this.config.get<string>('viettinbank.accountName') || fallback;
  }

  /**
   * Draws the order code and asks VietinBank for its dynamic QR. Runs before
   * the import transaction: a bank call must not hold database locks, and a
   * failure here saves nothing.
   */
  async prepareOrderQr(
    amount: Decimal,
    payee: string,
  ): Promise<PreparedOrderQr> {
    const now = new Date();
    const dateScope = `${now.getFullYear().toString().slice(2)}${String(
      now.getMonth() + 1,
    ).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    // Same counter as PaymentOrdersService, so codes never collide.
    const orderCode = await this.sequenceService.generateCode(
      `PAY${dateScope}`,
      `PAYMENT_ORDER:${dateScope}`,
      6,
    );
    // VAV is capped at 12 characters: the code without "PAY", as for every
    // VietinBank order.
    const transferContent = orderCode.slice(3);
    const qr = await this.viettinbankProvider.generateQr({
      bankCode: '970415',
      bankAccountNumber: '',
      bankAccountName: payee,
      amount,
      transferContent,
    });
    if (!qr.qrPayload) {
      throw new BadRequestException(
        `VietinBank không trả mã QR cho đơn ${orderCode}`,
      );
    }
    return {
      orderCode,
      transferContent,
      accountNumber:
        accountInVietQr(qr.qrPayload) ??
        `${this.config.get<string>('viettinbank.account') ?? ''}${transferContent}`,
      qrPayload: qr.qrPayload,
      qrUrl: qr.qrUrl,
    };
  }

  /**
   * One fee plan per imported list: the same student may appear on several
   * lists, and a receivable is unique per (student, fee plan).
   */
  async createListFeePlan(
    manager: EntityManager,
    input: {
      importSessionId: string;
      schoolId: string;
      academicYearId: string;
      name: string;
      unitPrice: Decimal;
      dueDate: string | null;
      createdBy: string;
    },
  ): Promise<FeePlan> {
    const categories = manager.getRepository(FeeCategory);
    let category = await categories.findOne({
      where: {
        schoolId: input.schoolId,
        name: PAYMENT_LIST_FEE_CATEGORY,
        deletedAt: IsNull(),
      },
    });
    while (!category) {
      const code = await this.sequenceService.generateCode(
        'KT',
        'FEE_CATEGORY',
        6,
      );
      if (
        await categories.exists({ where: { schoolId: input.schoolId, code } })
      )
        continue;
      category = await categories.save(
        categories.create({
          schoolId: input.schoolId,
          code,
          name: PAYMENT_LIST_FEE_CATEGORY,
          description: 'Khoản thu tạo khi import danh sách thu kèm số tiền',
          status: FeeCategoryStatus.ACTIVE,
        }),
      );
    }

    const plans = manager.getRepository(FeePlan);
    return plans.save(
      plans.create({
        schoolId: input.schoolId,
        academicYearId: input.academicYearId,
        semesterId: null,
        feeCategoryId: category.id,
        code: `${category.code}-${input.importSessionId.slice(0, 8).toUpperCase()}`,
        name: input.name.slice(0, 255),
        description: 'Tạo khi import danh sách thu',
        billingType: BillingType.ONE_TIME,
        unitPrice: input.unitPrice,
        quantity: new Decimal(1),
        defaultAmount: input.unitPrice,
        startDate: null,
        dueDate: input.dueDate,
        status: FeePlanStatus.ACTIVE,
        createdBy: input.createdBy,
      }),
    );
  }

  /** The order behind one slip, saved with the QR prepared for it. */
  async createOrderForRow(
    manager: EntityManager,
    input: {
      schoolId: string;
      studentId: string;
      receivableId: string;
      amount: Decimal;
      /** The list's NỘI DUNG, kept for search and printed as a note. */
      listContent: string;
      prepared: PreparedOrderQr;
      expiresAt: Date | null;
      createdBy: string;
    },
  ): Promise<PaymentOrder> {
    const orders = manager.getRepository(PaymentOrder);
    const order = await orders.save(
      orders.create({
        schoolId: input.schoolId,
        studentId: input.studentId,
        orderCode: input.prepared.orderCode,
        requestedAmount: input.amount,
        status: PaymentOrderStatus.PENDING,
        paymentMethod: PaymentMethod.VIETINBANK,
        bankCode: '970415',
        bankAccountNumber: input.prepared.accountNumber,
        transferContent: input.prepared.transferContent,
        legacyTransferContent: truncateVietQrText(
          toVietQrText(input.listContent),
          500,
        ),
        qrPayload: input.prepared.qrPayload,
        qrUrl: input.prepared.qrUrl,
        expiresAt: input.expiresAt,
        createdBy: input.createdBy,
      }),
    );
    const items = manager.getRepository(PaymentOrderItem);
    order.items = [
      await items.save(
        items.create({
          paymentOrderId: order.id,
          receivableId: input.receivableId,
          requestedAmount: input.amount,
        }),
      ),
    ];
    return order;
  }
}
