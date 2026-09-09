import { Column, Entity, Index } from 'typeorm';
import Decimal from 'decimal.js';
import { BaseEntityNoUpdate } from '../../common/entities/base.entity';
import { LedgerEntryType } from '../../common/enums/status.enum';
import { decimalColumn } from '../../common/utils/decimal.transformer';

@Entity('student_ledger_entries')
export class StudentLedgerEntry extends BaseEntityNoUpdate {
  @Column({ type: 'uuid' })
  schoolId: string;

  @Index()
  @Column({ type: 'uuid' })
  studentId: string;

  @Column({ type: 'enum', enum: LedgerEntryType })
  entryType: LedgerEntryType;

  @Column({ type: 'varchar', length: 50 })
  referenceType: string;

  @Column({ type: 'uuid' })
  referenceId: string;

  @Column(decimalColumn({ default: '0' }))
  debitAmount: Decimal;

  @Column(decimalColumn({ default: '0' }))
  creditAmount: Decimal;

  @Column({ type: 'varchar', length: 500 })
  description: string;

  @Column({ type: 'date' })
  postingDate: string;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;
}
