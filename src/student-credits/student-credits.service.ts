import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { StudentCredit } from './entities/student-credit.entity';
import { StudentCreditStatus } from '../common/enums/status.enum';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';

@Injectable()
export class StudentCreditsService {
  constructor(
    @InjectRepository(StudentCredit)
    private readonly repo: Repository<StudentCredit>,
  ) {}

  private repoFor(manager?: EntityManager): Repository<StudentCredit> {
    return manager ? manager.getRepository(StudentCredit) : this.repo;
  }

  async create(
    input: {
      schoolId: string;
      studentId: string;
      sourcePaymentTransactionId: string;
      amount: Decimal;
      note?: string;
    },
    manager: EntityManager,
  ): Promise<StudentCredit> {
    const repo = this.repoFor(manager);
    const credit = repo.create({
      schoolId: input.schoolId,
      studentId: input.studentId,
      sourcePaymentTransactionId: input.sourcePaymentTransactionId,
      amount: input.amount,
      remainingAmount: input.amount,
      status: StudentCreditStatus.AVAILABLE,
      note: input.note ?? null,
    });
    return repo.save(credit);
  }

  async findByStudent(studentId: string): Promise<StudentCredit[]> {
    return this.repo.find({
      where: { studentId },
      order: { createdAt: 'DESC' },
    });
  }

  async getAvailableBalance(studentId: string): Promise<Decimal> {
    const credits = await this.repo.find({
      where: { studentId, status: StudentCreditStatus.AVAILABLE },
    });
    return credits.reduce(
      (sum, c) => sum.plus(c.remainingAmount),
      new Decimal(0),
    );
  }

  /** Draws down credit for a student, oldest first, up to `amount`. Returns the amount actually drawn. */
  async draw(
    studentId: string,
    amount: Decimal,
    manager: EntityManager,
  ): Promise<Decimal> {
    const repo = this.repoFor(manager);
    const credits = await repo.find({
      where: { studentId, status: StudentCreditStatus.AVAILABLE },
      order: { createdAt: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });

    let remaining = amount;
    for (const credit of credits) {
      if (remaining.lte(0)) break;
      const draw = Decimal.min(remaining, credit.remainingAmount);
      credit.remainingAmount = credit.remainingAmount.minus(draw);
      if (credit.remainingAmount.lte(0))
        credit.status = StudentCreditStatus.ALLOCATED;
      await repo.save(credit);
      remaining = remaining.minus(draw);
    }
    return amount.minus(remaining);
  }

  async findById(id: string, manager?: EntityManager): Promise<StudentCredit> {
    const repo = this.repoFor(manager);
    const entity = await repo.findOne({ where: { id } });
    if (!entity)
      throw AppException.notFound(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy khoản tiền thừa',
      );
    return entity;
  }

  async markRefunded(
    id: string,
    amount: Decimal,
    manager: EntityManager,
  ): Promise<StudentCredit> {
    const repo = this.repoFor(manager);
    const credit = await this.findById(id, manager);
    if (amount.gt(credit.remainingAmount)) {
      throw AppException.badRequest(
        ErrorCode.REFUND_AMOUNT_INVALID,
        'Số tiền hoàn vượt quá số dư có',
      );
    }
    credit.remainingAmount = credit.remainingAmount.minus(amount);
    credit.status = credit.remainingAmount.lte(0)
      ? StudentCreditStatus.REFUNDED
      : StudentCreditStatus.AVAILABLE;
    return repo.save(credit);
  }
}
