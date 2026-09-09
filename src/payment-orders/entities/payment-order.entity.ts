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
import {
  PaymentMethod,
  PaymentOrderStatus,
} from '../../common/enums/status.enum';
import { decimalColumn } from '../../common/utils/decimal.transformer';
import { School } from '../../schools/entities/school.entity';
import { Student } from '../../students/entities/student.entity';
import { PaymentOrderItem } from './payment-order-item.entity';

@Entity('payment_orders')
export class PaymentOrder extends BaseEntity {
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
  orderCode: string;

  @Column(decimalColumn())
  requestedAmount: Decimal;

  @Column({
    type: 'enum',
    enum: PaymentOrderStatus,
    default: PaymentOrderStatus.PENDING,
  })
  status: PaymentOrderStatus;

  @Column({ type: 'enum', enum: PaymentMethod, default: PaymentMethod.VIETQR })
  paymentMethod: PaymentMethod;

  @Column({ type: 'varchar', length: 30, nullable: true })
  bankCode: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  bankAccountNumber: string | null;

  @Index()
  @Column({ type: 'varchar', length: 30 })
  transferContent: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  legacyTransferContent: string | null;

  @Column({ type: 'text', nullable: true })
  qrPayload: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  qrUrl: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @OneToMany(() => PaymentOrderItem, (item) => item.paymentOrder)
  items: PaymentOrderItem[];
}
