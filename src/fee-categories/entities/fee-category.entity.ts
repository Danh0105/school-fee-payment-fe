import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { FeeCategoryStatus } from '../../common/enums/status.enum';
import { School } from '../../schools/entities/school.entity';

@Entity('fee_categories')
@Index(['schoolId', 'code'], { unique: true })
export class FeeCategory extends BaseEntity {
  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ type: 'varchar', length: 30 })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  accountingCode: string | null;

  @Column({
    type: 'enum',
    enum: FeeCategoryStatus,
    default: FeeCategoryStatus.ACTIVE,
  })
  status: FeeCategoryStatus;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
