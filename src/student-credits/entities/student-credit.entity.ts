import { Column, Entity, Index } from 'typeorm';
import Decimal from 'decimal.js';
import { BaseEntity } from '../../common/entities/base.entity';
import { StudentCreditStatus } from '../../common/enums/status.enum';
import { decimalColumn } from '../../common/utils/decimal.transformer';

/** One row per credit-creating event (an overpayment). remainingAmount tracks what's left as it's drawn down. */
@Entity('student_credits')
export class StudentCredit extends BaseEntity {
  @Column({ type: 'uuid' })
  schoolId: string;

  @Index()
  @Column({ type: 'uuid' })
  studentId: string;

  @Column({ type: 'uuid' })
  sourcePaymentTransactionId: string;

  @Column(decimalColumn())
  amount: Decimal;

  @Column(decimalColumn())
  remainingAmount: Decimal;

  @Column({
    type: 'enum',
    enum: StudentCreditStatus,
    default: StudentCreditStatus.AVAILABLE,
  })
  status: StudentCreditStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;
}
