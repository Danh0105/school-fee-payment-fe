import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { BankReconciliation } from './entities/bank-reconciliation.entity';
import { PaymentTransaction } from '../payment-transactions/entities/payment-transaction.entity';
import { PaymentOrder } from '../payment-orders/entities/payment-order.entity';
import { StudentCredit } from '../student-credits/entities/student-credit.entity';
import { PaymentAllocationsService } from '../payment-allocations/payment-allocations.service';
import { ReceiptsService } from '../receipts/receipts.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PaginatedResult } from '../common/dto/paginated-result.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import {
  PaymentOrderStatus,
  PaymentTransactionStatus,
  ReconciliationStatus,
  StudentCreditStatus,
} from '../common/enums/status.enum';

@Injectable()
export class ReconciliationService {
  constructor(
    @InjectRepository(BankReconciliation)
    private readonly repo: Repository<BankReconciliation>,
    private readonly dataSource: DataSource,
    private readonly paymentAllocationsService: PaymentAllocationsService,
    private readonly receiptsService: ReceiptsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async listUnmatched(
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<BankReconciliation>> {
    const qb = this.repo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.paymentTransaction', 'transaction')
      .where('r.status = :status', { status: ReconciliationStatus.UNMATCHED })
      .orderBy('transaction.transactionTime', 'DESC');

    const [data, total] = await qb
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();
    return new PaginatedResult(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async match(
    transactionId: string,
    paymentOrderId: string,
    actor: { userId: string; ipAddress?: string; userAgent?: string },
  ): Promise<BankReconciliation> {
    return this.dataSource.transaction(async (manager) => {
      const reconciliationRepo = manager.getRepository(BankReconciliation);
      const transactionRepo = manager.getRepository(PaymentTransaction);
      const orderRepo = manager.getRepository(PaymentOrder);

      const reconciliation = await reconciliationRepo.findOne({
        where: { paymentTransactionId: transactionId },
      });
      if (!reconciliation)
        throw AppException.notFound(ErrorCode.TRANSACTION_NOT_FOUND);
      if (reconciliation.status !== ReconciliationStatus.UNMATCHED) {
        throw AppException.badRequest(ErrorCode.TRANSACTION_ALREADY_MATCHED);
      }

      const transaction = await transactionRepo.findOneOrFail({
        where: { id: transactionId },
      });
      const order = await orderRepo.findOne({
        where: { id: paymentOrderId },
        relations: { items: true },
      });
      if (!order)
        throw AppException.notFound(ErrorCode.PAYMENT_ORDER_NOT_FOUND);
      if (
        ![
          PaymentOrderStatus.PENDING,
          PaymentOrderStatus.PARTIALLY_PAID,
        ].includes(order.status)
      ) {
        throw AppException.badRequest(ErrorCode.PAYMENT_ORDER_NOT_PENDING);
      }

      await this.paymentAllocationsService.allocateToOrder(
        transaction,
        order,
        { userId: actor.userId },
        manager,
      );

      reconciliation.status = ReconciliationStatus.MANUAL_MATCHED;
      reconciliation.paymentOrderId = order.id;
      reconciliation.matchedBy = actor.userId;
      reconciliation.matchedAt = new Date();
      const saved = await reconciliationRepo.save(reconciliation);

      await this.auditLogsService.record(
        {
          userId: actor.userId,
          action: 'MATCH_TRANSACTION',
          entityType: 'PaymentTransaction',
          entityId: transactionId,
          newData: { paymentOrderId: order.id },
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        },
        manager,
      );

      return saved;
    });
  }

  async unmatch(
    transactionId: string,
    reason: string,
    actor: { userId: string; ipAddress?: string; userAgent?: string },
  ): Promise<BankReconciliation> {
    return this.dataSource.transaction(async (manager) => {
      const reconciliationRepo = manager.getRepository(BankReconciliation);
      const transactionRepo = manager.getRepository(PaymentTransaction);
      const creditRepo = manager.getRepository(StudentCredit);

      const reconciliation = await reconciliationRepo.findOne({
        where: { paymentTransactionId: transactionId },
      });
      if (!reconciliation)
        throw AppException.notFound(ErrorCode.TRANSACTION_NOT_FOUND);
      if (
        reconciliation.status !== ReconciliationStatus.AUTO_MATCHED &&
        reconciliation.status !== ReconciliationStatus.MANUAL_MATCHED
      ) {
        throw AppException.badRequest(
          ErrorCode.VALIDATION_ERROR,
          'Giao dịch chưa được đối soát nên không thể hủy khớp',
        );
      }

      const transaction = await transactionRepo.findOneOrFail({
        where: { id: transactionId },
      });

      await this.paymentAllocationsService.reverseByTransaction(
        transactionId,
        { userId: actor.userId },
        reason,
        manager,
      );
      await this.receiptsService.cancelByTransactionId(
        transactionId,
        reason,
        { userId: actor.userId },
        manager,
      );

      const untouchedCredits = await creditRepo.find({
        where: {
          sourcePaymentTransactionId: transactionId,
          status: StudentCreditStatus.AVAILABLE,
        },
      });
      for (const credit of untouchedCredits) {
        if (credit.remainingAmount.equals(credit.amount)) {
          credit.remainingAmount = new Decimal(0);
          credit.status = StudentCreditStatus.REFUNDED;
          credit.note =
            `${credit.note ?? ''} [Đã hủy do unmatch giao dịch: ${reason}]`.trim();
          await creditRepo.save(credit);
        }
      }

      transaction.status = PaymentTransactionStatus.UNMATCHED;
      await transactionRepo.save(transaction);

      reconciliation.status = ReconciliationStatus.UNMATCHED;
      reconciliation.paymentOrderId = null;
      reconciliation.note = reason;
      const saved = await reconciliationRepo.save(reconciliation);

      await this.auditLogsService.record(
        {
          userId: actor.userId,
          action: 'UNMATCH_TRANSACTION',
          entityType: 'PaymentTransaction',
          entityId: transactionId,
          newData: { reason },
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        },
        manager,
      );

      return saved;
    });
  }
}
