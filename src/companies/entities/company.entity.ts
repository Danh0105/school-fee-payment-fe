import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { EntityStatus } from '../../common/enums/status.enum';

/**
 * The organization that operates fee-collection for one or more Schools —
 * e.g. a back-office accounting service provider. ACCOUNTANT/CASHIER users
 * are scoped to a Company (not a single School) so the same central team can
 * work across every school that company manages, while still being unable
 * to see or touch schools belonging to a different company.
 */
@Entity('companies')
export class Company extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  taxCode: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  contactEmail: string | null;

  @Column({ type: 'enum', enum: EntityStatus, default: EntityStatus.ACTIVE })
  status: EntityStatus;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
