import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { StudentLedgerEntry } from './entities/student-ledger-entry.entity';
import { LedgerEntryType } from '../common/enums/status.enum';

export interface PostLedgerEntryInput {
  schoolId: string;
  studentId: string;
  entryType: LedgerEntryType;
  referenceType: string;
  referenceId: string;
  debitAmount?: Decimal | string | number;
  creditAmount?: Decimal | string | number;
  description: string;
  postingDate?: Date | string;
  createdBy?: string | null;
}

@Injectable()
export class LedgerService {
  constructor(
    @InjectRepository(StudentLedgerEntry)
    private readonly repo: Repository<StudentLedgerEntry>,
  ) {}

  async post(
    input: PostLedgerEntryInput,
    manager?: EntityManager,
  ): Promise<StudentLedgerEntry> {
    const repo = manager
      ? manager.getRepository(StudentLedgerEntry)
      : this.repo;
    const postingDate =
      typeof input.postingDate === 'string'
        ? input.postingDate
        : (input.postingDate ?? new Date()).toISOString().slice(0, 10);

    const entry = repo.create({
      schoolId: input.schoolId,
      studentId: input.studentId,
      entryType: input.entryType,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      debitAmount: new Decimal(input.debitAmount ?? 0),
      creditAmount: new Decimal(input.creditAmount ?? 0),
      description: input.description,
      postingDate,
      createdBy: input.createdBy ?? null,
    });
    return repo.save(entry);
  }

  async findByStudent(
    studentId: string,
    manager?: EntityManager,
  ): Promise<StudentLedgerEntry[]> {
    const repo = manager
      ? manager.getRepository(StudentLedgerEntry)
      : this.repo;
    return repo.find({
      where: { studentId },
      order: { postingDate: 'ASC', createdAt: 'ASC' },
    });
  }

  async getBalance(studentId: string): Promise<Decimal> {
    const entries = await this.findByStudent(studentId);
    return entries.reduce(
      (bal, e) => bal.plus(e.debitAmount).minus(e.creditAmount),
      new Decimal(0),
    );
  }
}
