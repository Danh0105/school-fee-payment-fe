import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { EntityStatus } from '../../common/enums/status.enum';

@Entity('schools')
export class School extends BaseEntity {
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
