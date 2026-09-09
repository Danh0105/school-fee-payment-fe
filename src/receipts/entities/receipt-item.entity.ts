import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import Decimal from 'decimal.js';
import { BaseEntityNoUpdate } from '../../common/entities/base.entity';
import { decimalColumn } from '../../common/utils/decimal.transformer';
import { Receipt } from './receipt.entity';
import { StudentReceivable } from '../../receivables/entities/student-receivable.entity';

@Entity('receipt_items')
export class ReceiptItem extends BaseEntityNoUpdate {
  @Column({ type: 'uuid' })
  receiptId: string;

  @ManyToOne(() => Receipt, (receipt) => receipt.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'receipt_id' })
  receipt: Receipt;

  @Column({ type: 'uuid', nullable: true })
  receivableId: string | null;

  @ManyToOne(() => StudentReceivable, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'receivable_id' })
  receivable: StudentReceivable | null;

  @Column({ type: 'varchar', length: 500 })
  description: string;

  @Column(decimalColumn())
  amount: Decimal;
}
