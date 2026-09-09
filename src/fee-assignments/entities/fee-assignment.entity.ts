import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntityNoUpdate } from '../../common/entities/base.entity';
import { FeeAssignmentTargetType } from '../../common/enums/status.enum';
import { FeePlan } from '../../fee-plans/entities/fee-plan.entity';

@Entity('fee_assignments')
export class FeeAssignment extends BaseEntityNoUpdate {
  @Column({ type: 'uuid' })
  feePlanId: string;

  @ManyToOne(() => FeePlan, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fee_plan_id' })
  feePlan: FeePlan;

  @Column({ type: 'enum', enum: FeeAssignmentTargetType })
  targetType: FeeAssignmentTargetType;

  @Column({ type: 'varchar', length: 100, nullable: true })
  targetId: string | null;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;
}
