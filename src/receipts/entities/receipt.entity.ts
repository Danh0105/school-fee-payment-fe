import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import Decimal from 'decimal.js';
import { BaseEntity } from '../../common/entities/base.entity';
import { PaymentMethod, ReceiptStatus } from '../../common/enums/status.enum';
import { decimalColumn } from '../../common/utils/decimal.transformer';
import { School } from '../../schools/entities/school.entity';
import { Student } from '../../students/entities/student.entity';
import { PaymentTransaction } from '../../payment-transactions/entities/payment-transaction.entity';
import { ReceiptItem } from './receipt-item.entity';

@Entity('receipts')
export class Receipt extends BaseEntity {
  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Index()
  @Column({ type: 'uuid' })
  studentId: string;

  @ManyToOne(() => Student, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 30 })
  receiptNumber: string;

  @Column({ type: 'uuid', nullable: true })
  paymentTransactionId: string | null;

  @ManyToOne(() => PaymentTransaction, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'payment_transaction_id' })
  paymentTransaction: PaymentTransaction | null;

  @Column(decimalColumn())
  totalAmount: Decimal;

  @Column({ type: 'enum', enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  @Column({ type: 'varchar', length: 255, nullable: true })
  payerName: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  payerPhone: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: ReceiptStatus, default: ReceiptStatus.ISSUED })
  status: ReceiptStatus;

  @Column({ type: 'timestamptz' })
  issuedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  issuedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  cancelledBy: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  cancelReason: string | null;

  @OneToMany(() => ReceiptItem, (item) => item.receipt)
  items: ReceiptItem[];
}
