import { BadRequestException, Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { EntityManager, IsNull } from 'typeorm';
import {
  BillingType,
  FeeCategoryStatus,
  FeePlanStatus,
  PaymentMethod,
  PaymentOrderStatus,
} from '../common/enums/status.enum';
import { buildTransferQr } from '../common/utils/vietqr.util';
import { SequenceService } from '../database/sequence.service';
import { FeeCategory } from '../fee-categories/entities/fee-category.entity';
import { FeePlan } from '../fee-plans/entities/fee-plan.entity';
import { PaymentOrder } from '../payment-orders/entities/payment-order.entity';
import { PaymentOrderItem } from '../payment-orders/entities/payment-order-item.entity';
import { School } from '../schools/entities/school.entity';
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

/** The school's bank account a payment-list QR transfers to. */
export function schoolTransferAccount(
  school: Pick<
    School,
    'name' | 'bankCode' | 'bankAccountNumber' | 'bankAccountName'
  >,
): { bankBin: string; accountNumber: string; accountName: string } {
  if (!school.bankCode || !/^\d{6}$/.test(school.bankCode)) {
    throw new BadRequestException(
      'Trường chưa có mã ngân hàng (BIN VietQR 6 chữ số) để tạo mã QR',
    );
  }
  if (!school.bankAccountNumber) {
    throw new BadRequestException(
      'Trường chưa có số tài khoản nhận tiền để tạo mã QR',
    );
  }
  return {
    bankBin: school.bankCode,
    accountNumber: school.bankAccountNumber,
    accountName: school.bankAccountName ?? school.name,
  };
}

/**
 * Debts and payment orders for an imported payment list ("danh sách thu"),
 * created inside the import's transaction so a failed import leaves nothing
 * behind.
 */
@Injectable()
export class ImportPaymentOrdersService {
  constructor(private readonly sequenceService: SequenceService) {}

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

  /**
   * The order a parent pays with the slip's QR: a VietQR to the school's own
   * account carrying the list's transfer content. transferContent is the
   * order code, as for every VietQR order, so the accountant records the
   * payment on the order like any other.
   */
  async createOrderForRow(
    manager: EntityManager,
    input: {
      school: School;
      studentId: string;
      receivableId: string;
      amount: Decimal;
      transferContent: string;
      expiresAt: Date | null;
      createdBy: string;
    },
  ): Promise<PaymentOrder> {
    const now = new Date();
    const dateScope = `${now.getFullYear().toString().slice(2)}${String(
      now.getMonth() + 1,
    ).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    // Same counter as PaymentOrdersService, so codes never collide; drawn
    // outside the import transaction so parents' orders are not blocked.
    const orderCode = await this.sequenceService.generateCode(
      `PAY${dateScope}`,
      `PAYMENT_ORDER:${dateScope}`,
      6,
    );
    const account = schoolTransferAccount(input.school);
    const qr = buildTransferQr({
      ...account,
      amount: input.amount.toFixed(0),
      transferContent: input.transferContent,
      reusable: input.expiresAt === null,
    });

    const orders = manager.getRepository(PaymentOrder);
    const order = await orders.save(
      orders.create({
        schoolId: input.school.id,
        studentId: input.studentId,
        orderCode,
        requestedAmount: input.amount,
        status: PaymentOrderStatus.PENDING,
        paymentMethod: PaymentMethod.VIETQR,
        bankCode: account.bankBin,
        bankAccountNumber: account.accountNumber,
        transferContent: orderCode,
        legacyTransferContent: qr.transferContent,
        qrPayload: qr.qrPayload,
        qrUrl: qr.qrUrl,
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
