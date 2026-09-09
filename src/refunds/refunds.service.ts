import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { Refund } from './entities/refund.entity';
import { StudentCredit } from '../student-credits/entities/student-credit.entity';
import { PaymentTransaction } from '../payment-transactions/entities/payment-transaction.entity';
import { CreateRefundDto } from './dto/create-refund.dto';
import { LedgerService } from '../ledger/ledger.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { SequenceService } from '../database/sequence.service';
import { PaginatedResult } from '../common/dto/paginated-result.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { applySchoolScope } from '../common/utils/school-scope.util';
import {
  LedgerEntryType,
  RefundStatus,
  StudentCreditStatus,
} from '../common/enums/status.enum';

@Injectable()
export class RefundsService {
  constructor(
    @InjectRepository(Refund)
    private readonly repo: Repository<Refund>,
    private readonly dataSource: DataSource,
    private readonly ledgerService: LedgerService,
    private readonly sequenceService: SequenceService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  /**
   * Refunds are settled only out of the student's available (unallocated)
   * credit tied to that specific transaction — money the school is still
   * holding, never yet recognized against a receivable. Un-paying a
   * receivable that's already recognized is a reversal, not a refund.
   */
  async create(
    dto: CreateRefundDto,
    actor: { userId: string; ipAddress?: string; userAgent?: string },
  ): Promise<Refund> {
    const amount = new Decimal(dto.amount);
    if (amount.lte(0))
      throw AppException.badRequest(ErrorCode.REFUND_AMOUNT_INVALID);

    return this.dataSource.transaction(async (manager) => {
      const transactionRepo = manager.getRepository(PaymentTransaction);
      const creditRepo = manager.getRepository(StudentCredit);
      const refundRepo = manager.getRepository(Refund);

      const transaction = await transactionRepo.findOne({
        where: { id: dto.paymentTransactionId },
      });
      if (!transaction)
        throw AppException.notFound(ErrorCode.TRANSACTION_NOT_FOUND);

      const credits = await creditRepo.find({
        where: {
          sourcePaymentTransactionId: dto.paymentTransactionId,
          status: StudentCreditStatus.AVAILABLE,
        },
        order: { createdAt: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      const available = credits.reduce(
        (sum, c) => sum.plus(c.remainingAmount),
        new Decimal(0),
      );
      if (amount.gt(available)) {
        throw AppException.badRequest(
          ErrorCode.REFUND_AMOUNT_INVALID,
          `Số dư có khả dụng từ giao dịch này chỉ còn ${available.toFixed(2)}`,
        );
      }
      const studentId = credits[0]?.studentId;
      if (!studentId) {
        throw AppException.badRequest(
          ErrorCode.REFUND_AMOUNT_INVALID,
          'Giao dịch này không có số dư có để hoàn tiền',
        );
      }

      // Global sequence scope — see the comment on receivableCode generation
      // in ReceivablesService for why this must not be scoped per school.
      const refundCode = await this.sequenceService.generateCode(
        'RF',
        'REFUND',
        8,
        manager,
      );
      const now = new Date();

      const refund = refundRepo.create({
        refundCode,
        studentId,
        paymentTransactionId: transaction.id,
        amount,
        reason: dto.reason,
        status: RefundStatus.COMPLETED,
        requestedBy: actor.userId,
        approvedBy: actor.userId,
        approvedAt: now,
        completedAt: now,
      });
      const saved = await refundRepo.save(refund);

      let remaining = amount;
      for (const credit of credits) {
        if (remaining.lte(0)) break;
        const draw = Decimal.min(remaining, credit.remainingAmount);
        credit.remainingAmount = credit.remainingAmount.minus(draw);
        credit.status = credit.remainingAmount.lte(0)
          ? StudentCreditStatus.REFUNDED
          : StudentCreditStatus.AVAILABLE;
        await creditRepo.save(credit);
        remaining = remaining.minus(draw);
      }

      await this.ledgerService.post(
        {
          schoolId: transaction.schoolId,
          studentId,
          entryType: LedgerEntryType.REFUND,
          referenceType: 'Refund',
          referenceId: saved.id,
          debitAmount: amount,
          description: `Hoàn tiền ${refundCode}: ${dto.reason}`,
          createdBy: actor.userId,
        },
        manager,
      );

      await this.auditLogsService.record(
        {
          userId: actor.userId,
          action: 'REFUND',
          entityType: 'Refund',
          entityId: saved.id,
          newData: { refundCode, amount: amount.toFixed(2) },
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        },
        manager,
      );

      return saved;
    });
  }

  async findAll(
    query: PaginationQueryDto,
    scopedIds?: string[] | null,
  ): Promise<PaginatedResult<Refund>> {
    const qb = this.repo
      .createQueryBuilder('r')
      .innerJoin('r.paymentTransaction', 'transaction')
      .orderBy(`r.${query.sortBy ?? 'createdAt'}`, query.sortOrder ?? 'DESC');
    if (!applySchoolScope(qb, 'transaction.schoolId', scopedIds ?? null)) {
      return new PaginatedResult([], 0, query.page ?? 1, query.limit ?? 20);
    }
    const [data, total] = await qb
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();
    return new PaginatedResult(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async findById(id: string): Promise<Refund> {
    const refund = await this.repo.findOne({
      where: { id },
      relations: { paymentTransaction: true },
    });
    if (!refund) throw AppException.notFound(ErrorCode.REFUND_NOT_FOUND);
    return refund;
  }
}
