import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { EntityStatus } from '../../common/enums/status.enum';
import { Company } from '../../companies/entities/company.entity';

@Entity('schools')
export class School extends BaseEntity {
  /** The back-office org that manages fee collection for this school, if any. Null = school is self-managed. */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  companyId: string | null;

  @ManyToOne(() => Company, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'company_id' })
  company: Company | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  taxCode: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  managerInfo: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  salesRepresentative: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  bankName: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  bankCode: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  bankAccountNumber: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  bankAccountName: string | null;

  @Column({ type: 'enum', enum: EntityStatus, default: EntityStatus.ACTIVE })
  status: EntityStatus;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
