import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import Decimal from 'decimal.js';
import { BaseEntityNoUpdate } from '../../common/entities/base.entity';
import {
  AdjustmentStatus,
  AdjustmentType,
} from '../../common/enums/status.enum';
import { decimalColumn } from '../../common/utils/decimal.transformer';
import { StudentReceivable } from '../../receivables/entities/student-receivable.entity';

@Entity('receivable_adjustments')
export class ReceivableAdjustment extends BaseEntityNoUpdate {
  @Column({ type: 'uuid' })
  receivableId: string;

  @ManyToOne(() => StudentReceivable, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'receivable_id' })
  receivable: StudentReceivable;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50 })
  adjustmentCode: string;

  @Column({ type: 'enum', enum: AdjustmentType })
  type: AdjustmentType;

  @Column(decimalColumn())
  amount: Decimal;

  @Column({ type: 'varchar', length: 500 })
  reason: string;

  @Column({
    type: 'enum',
    enum: AdjustmentStatus,
    default: AdjustmentStatus.DRAFT,
  })
  status: AdjustmentStatus;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt: Date | null;
}
