import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { School } from '../../../schools/entities/school.entity';

@Entity('einvoice_configs')
export class EInvoiceConfig {
  @Column({ type: 'uuid', primary: true, default: () => 'uuid_generate_v4()' })
  id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ type: 'varchar', length: 30, default: 'VIETTEL' })
  provider: string;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @Column({ type: 'boolean', default: true })
  autoIssue: boolean;

  @Column({ type: 'varchar', length: 20 })
  supplierTaxCode: string;

  @Column({ type: 'varchar', length: 20 })
  templateCode: string;

  @Column({ type: 'varchar', length: 25 })
  invoiceSeries: string;

  @Column({ type: 'varchar', length: 3, default: 'VND' })
  currencyCode: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  taxPercentage: string | null;

  @Column({ type: 'boolean', nullable: true })
  pricesIncludeTax: boolean | null;

  @Column({ type: 'varchar', length: 30, default: 'HSM' })
  signingMode: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
