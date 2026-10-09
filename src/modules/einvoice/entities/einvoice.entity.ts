import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { School } from '../../../schools/entities/school.entity';
import { Student } from '../../../students/entities/student.entity';
import { Receipt } from '../../../receipts/entities/receipt.entity';
import { PaymentTransaction } from '../../../payment-transactions/entities/payment-transaction.entity';
import { EInvoiceStatus } from './einvoice.enums';

@Entity('einvoices')
export class EInvoice extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ type: 'varchar', length: 30, default: 'VIETTEL' })
  provider: string;

  // A payment re-matched after unmatch gets a new invoice; only the
  // non-cancelled one has to be unique.
  @Index('UQ_einvoices_payment_active', {
    unique: true,
    where: `"status" <> 'CANCELLED'`,
  })
  @Column({ type: 'uuid' })
  paymentId: string;

  @ManyToOne(() => PaymentTransaction, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'payment_id' })
  payment: PaymentTransaction;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  receiptId: string;

  @ManyToOne(() => Receipt, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'receipt_id' })
  receipt: Receipt;

  @Index()
  @Column({ type: 'uuid' })
  studentId: string;

  @ManyToOne(() => Student, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @Column({ type: 'varchar', length: 20 }) supplierTaxCode: string;
  @Column({ type: 'varchar', length: 20 }) templateCode: string;
  @Column({ type: 'varchar', length: 25 }) invoiceSeries: string;
  @Column({ type: 'varchar', length: 50, nullable: true }) invoiceNo:
    string | null;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  transactionUuid: string;

  @Column({ type: 'varchar', length: 100, nullable: true }) transactionId:
    string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) reservationCode:
    string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) codeOfTax:
    string | null;
  @Column({ type: 'varchar', length: 30, nullable: true }) invoiceType:
    string | null;
  @Column({ type: 'varchar', length: 10, default: '1' }) adjustmentType: string;
  @Column({ type: 'uuid', nullable: true }) originalInvoiceId: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: EInvoiceStatus,
    default: EInvoiceStatus.PENDING,
  })
  status: EInvoiceStatus;

  @Column({ type: 'varchar', length: 100, nullable: true }) errorCode:
    string | null;
  @Column({ type: 'text', nullable: true }) errorDescription: string | null;
  @Column({ type: 'jsonb', nullable: true }) rawRequest: Record<
    string,
    unknown
  > | null;
  @Column({ type: 'jsonb', nullable: true }) rawResponse: Record<
    string,
    unknown
  > | null;
  @Column({ type: 'integer', default: 0 }) reconciliationAttempts: number;
  @Column({ type: 'timestamptz', nullable: true }) issuedAt: Date | null;
}
