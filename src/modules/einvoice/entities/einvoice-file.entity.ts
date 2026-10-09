import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntityNoUpdate } from '../../../common/entities/base.entity';
import { EInvoice } from './einvoice.entity';

@Entity('einvoice_files')
@Index(['invoiceId', 'fileType'], { unique: true })
export class EInvoiceFile extends BaseEntityNoUpdate {
  @Column({ type: 'uuid' }) invoiceId: string;
  @ManyToOne(() => EInvoice, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice: EInvoice;
  @Column({ type: 'varchar', length: 10 }) fileType: string;
  @Column({ type: 'varchar', length: 255 }) fileName: string;
  @Column({ type: 'varchar', length: 1000 }) storagePath: string;
  @Column({ type: 'varchar', length: 100 }) mimeType: string;
  @Column({ type: 'bigint' }) size: string;
  @Column({ type: 'varchar', length: 30, default: 'VIETTEL' }) provider: string;
}
