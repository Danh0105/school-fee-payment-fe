import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { StudentReceivable } from './entities/student-receivable.entity';
import { QueryReceivableDto } from './dto/query-receivable.dto';
import { PaginatedResult } from '../common/dto/paginated-result.dto';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { ReceivableStatus } from '../common/enums/status.enum';
import { SequenceService } from '../database/sequence.service';
import { LedgerService } from '../ledger/ledger.service';
import { LedgerEntryType } from '../common/enums/status.enum';
import { StudentClass } from '../student-classes/entities/student-class.entity';

export interface CreateReceivableInput {
  schoolId: string;
  studentId: string;
  academicYearId: string;
  semesterId?: string | null;
  feePlanId: string;
  description?: string | null;
  quantity: Decimal;
  unitPrice: Decimal;
  dueDate?: string | null;
  createdBy?: string | null;
}

@Injectable()
export class ReceivablesService {
  constructor(
    @InjectRepository(StudentReceivable)
    private readonly repo: Repository<StudentReceivable>,
    private readonly dataSource: DataSource,
    private readonly sequenceService: SequenceService,
    private readonly ledgerService: LedgerService,
  ) {}

  private repoFor(manager?: EntityManager): Repository<StudentReceivable> {
    return manager ? manager.getRepository(StudentReceivable) : this.repo;
  }

  /** Creates one receivable and posts the corresponding RECEIVABLE debit ledger entry. Idempotent per (studentId, feePlanId). */
  async createIfNotExists(
    input: CreateReceivableInput,
    manager: EntityManager,
  ): Promise<StudentReceivable | null> {
    const repo = this.repoFor(manager);
    const existing = await repo.findOne({
      where: { studentId: input.studentId, feePlanId: input.feePlanId },
    });
    if (existing) return null;

    const originalAmount = input.quantity.times(input.unitPrice);
    // Sequence scope is intentionally global (not per-school): receivableCode
    // has a system-wide unique constraint, and scoping the counter per school
    // while keeping a global uniqueness constraint would let two schools both
    // mint "RC00000001" and collide.
    const receivableCode = await this.sequenceService.generateCode(
      'RC',
      'RECEIVABLE',
      8,
      manager,
    );

    const receivable = repo.create({
      schoolId: input.schoolId,
      studentId: input.studentId,
      academicYearId: input.academicYearId,
      semesterId: input.semesterId ?? null,
      feePlanId: input.feePlanId,
      receivableCode,
      description: input.description ?? null,
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      originalAmount,
      discountAmount: new Decimal(0),
      adjustmentAmount: new Decimal(0),
      amountDue: originalAmount,
      amountPaid: new Decimal(0),
      amountOutstanding: originalAmount,
      dueDate: input.dueDate ?? null,
      status: ReceivableStatus.UNPAID,
      createdBy: input.createdBy ?? null,
    });
    const saved = await repo.save(receivable);

    await this.ledgerService.post(
      {
        schoolId: input.schoolId,
        studentId: input.studentId,
        entryType: LedgerEntryType.RECEIVABLE,
        referenceType: 'StudentReceivable',
        referenceId: saved.id,
        debitAmount: originalAmount,
        description: input.description ?? `Phát sinh công nợ ${receivableCode}`,
        createdBy: input.createdBy,
      },
      manager,
    );

    return saved;
  }

  async findAll(
    query: QueryReceivableDto,
  ): Promise<PaginatedResult<StudentReceivable>> {
    const qb = this.repo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.student', 'student')
      .leftJoinAndSelect('r.feePlan', 'feePlan')
      .orderBy(`r.${query.sortBy ?? 'createdAt'}`, query.sortOrder ?? 'DESC');

    if (query.schoolId)
      qb.andWhere('r.schoolId = :schoolId', { schoolId: query.schoolId });
    if (query.academicYearId)
      qb.andWhere('r.academicYearId = :ayId', { ayId: query.academicYearId });
    if (query.semesterId)
      qb.andWhere('r.semesterId = :semId', { semId: query.semesterId });
    if (query.studentId)
      qb.andWhere('r.studentId = :studentId', { studentId: query.studentId });
    if (query.feeCategoryId)
      qb.andWhere('feePlan.feeCategoryId = :fcId', {
        fcId: query.feeCategoryId,
      });
    if (query.status)
      qb.andWhere('r.status = :status', { status: query.status });
    if (query.classId) {
      qb.andWhere(
        (subQb) =>
          `r.studentId IN ${subQb
            .subQuery()
            .select('sc.studentId')
            .from(StudentClass, 'sc')
            .where('sc.classId = :classId')
            .andWhere("sc.status = 'ACTIVE'")
            .getQuery()}`,
      ).setParameter('classId', query.classId);
    }
    if (query.search) {
      qb.andWhere(
        '(student.fullName ILIKE :search OR r.receivableCode ILIKE :search)',
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

  async findById(
    id: string,
    manager?: EntityManager,
  ): Promise<StudentReceivable> {
    const repo = this.repoFor(manager);
    const entity = await repo.findOne({
      where: { id },
      relations: { student: true, feePlan: true },
    });
    if (!entity) throw AppException.notFound(ErrorCode.RECEIVABLE_NOT_FOUND);
    return entity;
  }

  async findByStudent(studentId: string): Promise<StudentReceivable[]> {
    return this.repo.find({
      where: { studentId },
      relations: { feePlan: true },
      order: { createdAt: 'ASC' },
    });
  }

  /** Locks the receivable row for update within an existing transaction. */
  private async lockForUpdate(
    id: string,
    manager: EntityManager,
  ): Promise<StudentReceivable> {
    const entity = await manager
      .getRepository(StudentReceivable)
      .createQueryBuilder('r')
      .setLock('pessimistic_write')
      .where('r.id = :id', { id })
      .getOne();
    if (!entity) throw AppException.notFound(ErrorCode.RECEIVABLE_NOT_FOUND);
    return entity;
  }

  private recomputeStatus(receivable: StudentReceivable): ReceivableStatus {
    if (receivable.status === ReceivableStatus.CANCELLED)
      return ReceivableStatus.CANCELLED;
    if (receivable.amountOutstanding.lte(0)) return ReceivableStatus.PAID;
    if (receivable.amountPaid.gt(0)) return ReceivableStatus.PARTIALLY_PAID;
    if (
      receivable.dueDate &&
      new Date(receivable.dueDate) < new Date(new Date().toDateString())
    ) {
      return ReceivableStatus.OVERDUE;
    }
    return ReceivableStatus.UNPAID;
  }

  private assertMutable(receivable: StudentReceivable): void {
    if (receivable.status === ReceivableStatus.CANCELLED) {
      throw AppException.badRequest(ErrorCode.RECEIVABLE_CANCELLED);
    }
  }

  /** Applies a discount/adjustment delta and recomputes amountDue/amountOutstanding/status. Caller must run in a transaction. */
  async applyDiscountDelta(
    receivableId: string,
    delta: Decimal,
    manager: EntityManager,
  ): Promise<StudentReceivable> {
    const repo = this.repoFor(manager);
    const receivable = await this.lockForUpdate(receivableId, manager);
    this.assertMutable(receivable);

    receivable.discountAmount = receivable.discountAmount.plus(delta);
    this.recomputeAmounts(receivable);
    receivable.status = this.recomputeStatus(receivable);
    return repo.save(receivable);
  }

  async applyAdjustmentDelta(
    receivableId: string,
    signedDelta: Decimal,
    manager: EntityManager,
  ): Promise<StudentReceivable> {
    const repo = this.repoFor(manager);
    const receivable = await this.lockForUpdate(receivableId, manager);
    this.assertMutable(receivable);

    receivable.adjustmentAmount = receivable.adjustmentAmount.plus(signedDelta);
    this.recomputeAmounts(receivable);
    receivable.status = this.recomputeStatus(receivable);
    return repo.save(receivable);
  }

  /** Applies a payment allocation amount (increases amountPaid, decreases outstanding). Caller must run in a transaction. */
  async applyPaymentDelta(
    receivableId: string,
    amount: Decimal,
    manager: EntityManager,
  ): Promise<StudentReceivable> {
    const repo = this.repoFor(manager);
    const receivable = await this.lockForUpdate(receivableId, manager);
    this.assertMutable(receivable);

    if (amount.gt(receivable.amountOutstanding)) {
      throw AppException.badRequest(
        ErrorCode.PAYMENT_AMOUNT_EXCEEDS_AVAILABLE,
        'Số tiền phân bổ vượt quá số còn phải thu của khoản công nợ này',
      );
    }

    receivable.amountPaid = receivable.amountPaid.plus(amount);
    this.recomputeAmounts(receivable);
    receivable.status = this.recomputeStatus(receivable);
    return repo.save(receivable);
  }

  /** Reverses a previously applied payment allocation (e.g. on refund/reversal). */
  async reversePaymentDelta(
    receivableId: string,
    amount: Decimal,
    manager: EntityManager,
  ): Promise<StudentReceivable> {
    const repo = this.repoFor(manager);
    const receivable = await this.lockForUpdate(receivableId, manager);

    receivable.amountPaid = Decimal.max(0, receivable.amountPaid.minus(amount));
    this.recomputeAmounts(receivable);
    receivable.status = this.recomputeStatus(receivable);
    return repo.save(receivable);
  }

  private recomputeAmounts(receivable: StudentReceivable): void {
    receivable.amountDue = receivable.originalAmount
      .minus(receivable.discountAmount)
      .plus(receivable.adjustmentAmount);
    receivable.amountOutstanding = receivable.amountDue.minus(
      receivable.amountPaid,
    );
  }

  getDataSource(): DataSource {
    return this.dataSource;
  }
}
