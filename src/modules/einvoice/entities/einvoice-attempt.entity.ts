import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntityNoUpdate } from '../../../common/entities/base.entity';
import { EInvoice } from './einvoice.entity';
import {
  EInvoiceAttemptOperation,
  EInvoiceAttemptStatus,
} from './einvoice.enums';

@Entity('einvoice_attempts')
export class EInvoiceAttempt extends BaseEntityNoUpdate {
  @Index() @Column({ type: 'uuid' }) invoiceId: string;
  @ManyToOne(() => EInvoice, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice: EInvoice;
  @Column({ type: 'enum', enum: EInvoiceAttemptOperation })
  operation: EInvoiceAttemptOperation;
  @Column({ type: 'enum', enum: EInvoiceAttemptStatus })
  status: EInvoiceAttemptStatus;
  @Column({ type: 'varchar', length: 100 }) requestId: string;
  @Column({ type: 'varchar', length: 500 }) endpoint: string;
  @Column({ type: 'integer', nullable: true }) httpStatus: number | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) errorCode:
    string | null;
  @Column({ type: 'text', nullable: true }) errorDescription: string | null;
  @Column({ type: 'boolean', default: false }) retryable: boolean;
  @Column({ type: 'integer', nullable: true }) durationMs: number | null;
}
