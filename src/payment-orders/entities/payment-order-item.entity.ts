import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import Decimal from 'decimal.js';
import { BaseEntityNoUpdate } from '../../common/entities/base.entity';
import { decimalColumn } from '../../common/utils/decimal.transformer';
import { PaymentOrder } from './payment-order.entity';
import { StudentReceivable } from '../../receivables/entities/student-receivable.entity';

@Entity('payment_order_items')
export class PaymentOrderItem extends BaseEntityNoUpdate {
  @Column({ type: 'uuid' })
  paymentOrderId: string;

  @ManyToOne(() => PaymentOrder, (order) => order.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'payment_order_id' })
  paymentOrder: PaymentOrder;

  @Column({ type: 'uuid' })
  receivableId: string;

  @ManyToOne(() => StudentReceivable, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'receivable_id' })
  receivable: StudentReceivable;

  @Column(decimalColumn())
  requestedAmount: Decimal;
}
