import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntityNoUpdate } from '../../../common/entities/base.entity';
import { EInvoice } from './einvoice.entity';

@Entity('einvoice_events')
export class EInvoiceEvent extends BaseEntityNoUpdate {
  @Index() @Column({ type: 'uuid' }) invoiceId: string;
  @ManyToOne(() => EInvoice, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice: EInvoice;
  @Column({ type: 'varchar', length: 100 }) eventType: string;
  @Column({ type: 'jsonb', nullable: true }) payload: Record<
    string,
    unknown
  > | null;
}
