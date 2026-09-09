import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { ReconciliationStatus } from '../../common/enums/status.enum';
import { PaymentTransaction } from '../../payment-transactions/entities/payment-transaction.entity';
import { PaymentOrder } from '../../payment-orders/entities/payment-order.entity';

@Entity('bank_reconciliations')
export class BankReconciliation extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'uuid' })
  paymentTransactionId: string;

  @ManyToOne(() => PaymentTransaction, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payment_transaction_id' })
  paymentTransaction: PaymentTransaction;

  @Column({ type: 'uuid', nullable: true })
  paymentOrderId: string | null;

  @ManyToOne(() => PaymentOrder, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'payment_order_id' })
  paymentOrder: PaymentOrder | null;

  @Index()
  @Column({ type: 'enum', enum: ReconciliationStatus })
  status: ReconciliationStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @Column({ type: 'uuid', nullable: true })
  matchedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  matchedAt: Date | null;
}
