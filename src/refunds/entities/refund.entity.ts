import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import Decimal from 'decimal.js';
import { BaseEntity } from '../../common/entities/base.entity';
import { RefundStatus } from '../../common/enums/status.enum';
import { decimalColumn } from '../../common/utils/decimal.transformer';
import { Student } from '../../students/entities/student.entity';
import { PaymentTransaction } from '../../payment-transactions/entities/payment-transaction.entity';
import { Receipt } from '../../receipts/entities/receipt.entity';

@Entity('refunds')
export class Refund extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 30 })
  refundCode: string;

  @Column({ type: 'uuid' })
  studentId: string;

  @ManyToOne(() => Student, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @Column({ type: 'uuid' })
  paymentTransactionId: string;

  @ManyToOne(() => PaymentTransaction, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'payment_transaction_id' })
  paymentTransaction: PaymentTransaction;

  @Column({ type: 'uuid', nullable: true })
  receiptId: string | null;

  @ManyToOne(() => Receipt, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'receipt_id' })
  receipt: Receipt | null;

  @Column(decimalColumn())
  amount: Decimal;

  @Column({ type: 'varchar', length: 500 })
  reason: string;

  @Column({ type: 'enum', enum: RefundStatus, default: RefundStatus.REQUESTED })
  status: RefundStatus;

  @Column({ type: 'uuid' })
  requestedBy: string;

  @Column({ type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
