import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import Decimal from 'decimal.js';
import { BaseEntityNoUpdate } from '../../common/entities/base.entity';
import { decimalColumn } from '../../common/utils/decimal.transformer';
import { PaymentTransaction } from '../../payment-transactions/entities/payment-transaction.entity';
import { PaymentOrder } from '../../payment-orders/entities/payment-order.entity';
import { StudentReceivable } from '../../receivables/entities/student-receivable.entity';

@Entity('payment_allocations')
export class PaymentAllocation extends BaseEntityNoUpdate {
  @Index()
  @Column({ type: 'uuid' })
  paymentTransactionId: string;

  @ManyToOne(() => PaymentTransaction, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'payment_transaction_id' })
  paymentTransaction: PaymentTransaction;

  @Column({ type: 'uuid', nullable: true })
  paymentOrderId: string | null;

  @ManyToOne(() => PaymentOrder, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'payment_order_id' })
  paymentOrder: PaymentOrder | null;

  @Index()
  @Column({ type: 'uuid' })
  receivableId: string;

  @ManyToOne(() => StudentReceivable, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'receivable_id' })
  receivable: StudentReceivable;

  @Column(decimalColumn())
  allocatedAmount: Decimal;

  @Column({ type: 'boolean', default: false })
  reversed: boolean;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;
}
