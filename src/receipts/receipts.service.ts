import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { Receipt } from './entities/receipt.entity';
import { ReceiptItem } from './entities/receipt-item.entity';
import { QueryReceiptDto } from './dto/query-receipt.dto';
import { PaginatedResult } from '../common/dto/paginated-result.dto';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { PaymentMethod, ReceiptStatus } from '../common/enums/status.enum';
import { SequenceService } from '../database/sequence.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

export interface IssueReceiptInput {
  schoolId: string;
  studentId: string;
  paymentTransactionId?: string | null;
  paymentMethod: PaymentMethod;
  payerName?: string | null;
  payerPhone?: string | null;
  description?: string | null;
  issuedBy: string | null;
  items: {
    receivableId: string | null;
    description: string;
    amount: Decimal;
  }[];
}

@Injectable()
export class ReceiptsService {
  constructor(
    @InjectRepository(Receipt)
    private readonly repo: Repository<Receipt>,
    private readonly dataSource: DataSource,
    private readonly sequenceService: SequenceService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async issue(
    input: IssueReceiptInput,
    manager: EntityManager,
  ): Promise<Receipt> {
    const receiptRepo = manager.getRepository(Receipt);
    const itemRepo = manager.getRepository(ReceiptItem);

    const year = new Date().getFullYear();
    const receiptNumber = await this.sequenceService.generateCode(
      'PT-' + year + '-',
      `RECEIPT:${year}`,
      6,
      manager,
    );

    const totalAmount = input.items.reduce(
      (sum, i) => sum.plus(i.amount),
      new Decimal(0),
    );

    const receipt = receiptRepo.create({
      schoolId: input.schoolId,
      studentId: input.studentId,
      receiptNumber,
      paymentTransactionId: input.paymentTransactionId ?? null,
      totalAmount,
      paymentMethod: input.paymentMethod,
      payerName: input.payerName ?? null,
      payerPhone: input.payerPhone ?? null,
      description: input.description ?? null,
      status: ReceiptStatus.ISSUED,
      issuedAt: new Date(),
      issuedBy: input.issuedBy,
    });
    const saved = await receiptRepo.save(receipt);

    const items = input.items.map((i) =>
      itemRepo.create({
        receiptId: saved.id,
        receivableId: i.receivableId,
        description: i.description,
        amount: i.amount,
      }),
    );
    saved.items = await itemRepo.save(items);

    await this.auditLogsService.record(
      {
        userId: input.issuedBy,
        action: 'ISSUE_RECEIPT',
        entityType: 'Receipt',
        entityId: saved.id,
        newData: { receiptNumber, totalAmount: totalAmount.toFixed(2) },
      },
      manager,
    );

    return saved;
  }

  async findAll(query: QueryReceiptDto): Promise<PaginatedResult<Receipt>> {
    const qb = this.repo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.student', 'student')
      .orderBy(`r.${query.sortBy ?? 'issuedAt'}`, query.sortOrder ?? 'DESC');

    if (query.schoolId)
      qb.andWhere('r.schoolId = :schoolId', { schoolId: query.schoolId });
    if (query.studentId)
      qb.andWhere('r.studentId = :studentId', { studentId: query.studentId });
    if (query.status)
      qb.andWhere('r.status = :status', { status: query.status });
    if (query.search) {
      qb.andWhere(
        '(r.receiptNumber ILIKE :search OR student.fullName ILIKE :search)',
        {
          search: `%${query.search}%`,
        },
      );
    }

    const [data, total] = await qb
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();
    return new PaginatedResult(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async findById(id: string): Promise<Receipt> {
    const receipt = await this.repo.findOne({
      where: { id },
      relations: { items: true, student: true },
    });
    if (!receipt) throw AppException.notFound(ErrorCode.RECEIPT_NOT_FOUND);
    return receipt;
  }

  async cancel(
    id: string,
    reason: string,
    actor: { userId: string | null },
  ): Promise<Receipt> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Receipt);
      const receipt = await repo.findOne({ where: { id } });
      if (!receipt) throw AppException.notFound(ErrorCode.RECEIPT_NOT_FOUND);
      return this.cancelInternal(receipt, reason, actor, manager);
    });
  }

  /** Cancels a receipt within a caller-managed transaction, e.g. when reversing the underlying payment. */
  async cancelByTransactionId(
    paymentTransactionId: string,
    reason: string,
    actor: { userId: string | null },
    manager: EntityManager,
  ): Promise<Receipt | null> {
    const repo = manager.getRepository(Receipt);
    const receipt = await repo.findOne({
      where: { paymentTransactionId, status: ReceiptStatus.ISSUED },
    });
    if (!receipt) return null;
    return this.cancelInternal(receipt, reason, actor, manager);
  }

  private async cancelInternal(
    receipt: Receipt,
    reason: string,
    actor: { userId: string | null },
    manager: EntityManager,
  ): Promise<Receipt> {
    const repo = manager.getRepository(Receipt);
    if (receipt.status === ReceiptStatus.CANCELLED) {
      throw AppException.badRequest(ErrorCode.RECEIPT_ALREADY_CANCELLED);
    }

    receipt.status = ReceiptStatus.CANCELLED;
    receipt.cancelledAt = new Date();
    receipt.cancelledBy = actor.userId;
    receipt.cancelReason = reason;
    const saved = await repo.save(receipt);

    await this.auditLogsService.record(
      {
        userId: actor.userId,
        action: 'CANCEL_RECEIPT',
        entityType: 'Receipt',
        entityId: receipt.id,
        newData: { reason },
      },
      manager,
    );

    return saved;
  }
}
