import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { PaymentAllocation } from './entities/payment-allocation.entity';
import { PaymentOrder } from '../payment-orders/entities/payment-order.entity';
import { PaymentTransaction } from '../payment-transactions/entities/payment-transaction.entity';
import { ReceivablesService } from '../receivables/receivables.service';
import { LedgerService } from '../ledger/ledger.service';
import { ReceiptsService } from '../receipts/receipts.service';
import { StudentCreditsService } from '../student-credits/student-credits.service';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import {
  LedgerEntryType,
  PaymentOrderStatus,
  PaymentTransactionStatus,
  ReceivableStatus,
} from '../common/enums/status.enum';

export interface AllocationOutcome {
  transactionId: string;
  allocatedTotal: Decimal;
  creditedAmount: Decimal;
  allocations: PaymentAllocation[];
  receiptId: string | null;
}

@Injectable()
export class PaymentAllocationsService {
  constructor(
    @InjectRepository(PaymentAllocation)
    private readonly repo: Repository<PaymentAllocation>,
    private readonly receivablesService: ReceivablesService,
    private readonly ledgerService: LedgerService,
    private readonly receiptsService: ReceiptsService,
    private readonly studentCreditsService: StudentCreditsService,
  ) {}

  /**
   * Allocates a RECEIVED/MATCHED transaction's amount across the given
   * order's items — the receivable outstanding amount at that moment, in
   * order, never exceeding it. Any amount left over becomes a StudentCredit.
   * Always issues one Receipt for whatever this transaction actually paid.
   * Must run inside a transaction the caller controls.
   */
  async allocateToOrder(
    transaction: PaymentTransaction,
    order: PaymentOrder,
    actor: { userId: string | null },
    manager: EntityManager,
  ): Promise<AllocationOutcome> {
    if (transaction.status === PaymentTransactionStatus.ALLOCATED) {
      throw AppException.badRequest(ErrorCode.TRANSACTION_ALREADY_ALLOCATED);
    }
    if (transaction.status === PaymentTransactionStatus.REVERSED) {
      throw AppException.badRequest(ErrorCode.TRANSACTION_REVERSED);
    }

    const allocationRepo = manager.getRepository(PaymentAllocation);
    const orderRepo = manager.getRepository(PaymentOrder);
    const transactionRepo = manager.getRepository(PaymentTransaction);

    let available = transaction.amount;
    const allocations: PaymentAllocation[] = [];
    const receiptItems: {
      receivableId: string | null;
      description: string;
      amount: Decimal;
    }[] = [];

    for (const item of order.items) {
      if (available.lte(0)) break;
      const receivable = await this.receivablesService.findById(
        item.receivableId,
        manager,
      );
      if (receivable.status === ReceivableStatus.CANCELLED) continue;
      const toAllocate = Decimal.min(available, receivable.amountOutstanding);
      if (toAllocate.lte(0)) continue;

      const allocation = allocationRepo.create({
        paymentTransactionId: transaction.id,
        paymentOrderId: order.id,
        receivableId: receivable.id,
        allocatedAmount: toAllocate,
        createdBy: actor.userId,
      });
      allocations.push(await allocationRepo.save(allocation));

      await this.receivablesService.applyPaymentDelta(
        receivable.id,
        toAllocate,
        manager,
      );

      await this.ledgerService.post(
        {
          schoolId: order.schoolId,
          studentId: order.studentId,
          entryType: LedgerEntryType.PAYMENT,
          referenceType: 'PaymentAllocation',
          referenceId: allocation.id,
          creditAmount: toAllocate,
          description: `Thanh toán khoản công nợ ${receivable.receivableCode} (${order.orderCode})`,
          createdBy: actor.userId,
        },
        manager,
      );

      receiptItems.push({
        receivableId: receivable.id,
        description: receivable.description ?? receivable.receivableCode,
        amount: toAllocate,
      });

      available = available.minus(toAllocate);
    }

    const allocatedTotal = allocations.reduce(
      (sum, a) => sum.plus(a.allocatedAmount),
      new Decimal(0),
    );

    let creditedAmount = new Decimal(0);
    if (available.gt(0)) {
      creditedAmount = available;
      const credit = await this.studentCreditsService.create(
        {
          schoolId: order.schoolId,
          studentId: order.studentId,
          sourcePaymentTransactionId: transaction.id,
          amount: available,
          note: `Tiền thừa từ giao dịch ${transaction.externalTransactionId} (${order.orderCode})`,
        },
        manager,
      );

      await this.ledgerService.post(
        {
          schoolId: order.schoolId,
          studentId: order.studentId,
          entryType: LedgerEntryType.CREDIT,
          referenceType: 'StudentCredit',
          referenceId: credit.id,
          creditAmount: available,
          description: `Tiền thừa chưa phân bổ (${order.orderCode})`,
          createdBy: actor.userId,
        },
        manager,
      );

      receiptItems.push({
        receivableId: null,
        description: 'Tiền thừa (giữ lại số dư có)',
        amount: available,
      });
    }

    // Re-check every item on the order (not just the ones this transaction touched) to decide order status.
    let orderFullyPaid = true;
    for (const item of order.items) {
      const receivable = await this.receivablesService.findById(
        item.receivableId,
        manager,
      );
      if (
        receivable.status !== ReceivableStatus.CANCELLED &&
        receivable.amountOutstanding.gt(0)
      ) {
        orderFullyPaid = false;
        break;
      }
    }
    order.status = orderFullyPaid
      ? PaymentOrderStatus.PAID
      : PaymentOrderStatus.PARTIALLY_PAID;
    if (orderFullyPaid) order.paidAt = new Date();
    await orderRepo.save(order);

    transaction.status = PaymentTransactionStatus.ALLOCATED;
    await transactionRepo.save(transaction);

    let receiptId: string | null = null;
    if (receiptItems.length > 0) {
      const receipt = await this.receiptsService.issue(
        {
          schoolId: order.schoolId,
          studentId: order.studentId,
          paymentTransactionId: transaction.id,
          paymentMethod: order.paymentMethod,
          description: `Thu tiền theo yêu cầu thanh toán ${order.orderCode}`,
          issuedBy: actor.userId,
          items: receiptItems,
        },
        manager,
      );
      receiptId = receipt.id;
    }

    return {
      transactionId: transaction.id,
      allocatedTotal,
      creditedAmount,
      allocations,
      receiptId,
    };
  }

  /**
   * Reverses every not-yet-reversed allocation for a transaction: puts the
   * money back onto the receivable's outstanding balance, posts a REVERSAL
   * ledger entry undoing each PAYMENT credit, and voids any credit this
   * transaction created (only if still fully untouched — a partially drawn
   * or refunded credit blocks automatic reversal and needs manual review).
   */
  async reverseByTransaction(
    transactionId: string,
    actor: { userId: string | null },
    reason: string,
    manager: EntityManager,
  ): Promise<PaymentAllocation[]> {
    const allocationRepo = manager.getRepository(PaymentAllocation);
    const allocations = await allocationRepo.find({
      where: { paymentTransactionId: transactionId, reversed: false },
    });

    const reversed: PaymentAllocation[] = [];
    for (const allocation of allocations) {
      const receivable = await this.receivablesService.reversePaymentDelta(
        allocation.receivableId,
        allocation.allocatedAmount,
        manager,
      );

      await this.ledgerService.post(
        {
          schoolId: receivable.schoolId,
          studentId: receivable.studentId,
          entryType: LedgerEntryType.REVERSAL,
          referenceType: 'PaymentAllocation',
          referenceId: allocation.id,
          debitAmount: allocation.allocatedAmount,
          description: `Đảo giao dịch: ${reason}`,
          createdBy: actor.userId,
        },
        manager,
      );

      allocation.reversed = true;
      reversed.push(await allocationRepo.save(allocation));
    }

    return reversed;
  }

  async findByTransaction(transactionId: string): Promise<PaymentAllocation[]> {
    return this.repo.find({
      where: { paymentTransactionId: transactionId },
      relations: { receivable: true },
    });
  }

  async findByReceivable(receivableId: string): Promise<PaymentAllocation[]> {
    return this.repo.find({
      where: { receivableId },
      order: { createdAt: 'DESC' },
    });
  }
}
