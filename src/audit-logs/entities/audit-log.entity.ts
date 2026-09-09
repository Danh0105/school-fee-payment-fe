import { Column, Entity, Index } from 'typeorm';
import { BaseEntityNoUpdate } from '../../common/entities/base.entity';

export enum AuditAction {
  CREATE_RECEIVABLE = 'CREATE_RECEIVABLE',
  ADJUST_RECEIVABLE = 'ADJUST_RECEIVABLE',
  APPLY_DISCOUNT = 'APPLY_DISCOUNT',
  MANUAL_PAYMENT = 'MANUAL_PAYMENT',
  MATCH_TRANSACTION = 'MATCH_TRANSACTION',
  UNMATCH_TRANSACTION = 'UNMATCH_TRANSACTION',
  ISSUE_RECEIPT = 'ISSUE_RECEIPT',
  CANCEL_RECEIPT = 'CANCEL_RECEIPT',
  REFUND = 'REFUND',
  REVERSE_TRANSACTION = 'REVERSE_TRANSACTION',
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  LOGIN = 'LOGIN',
}

@Entity('audit_logs')
export class AuditLog extends BaseEntityNoUpdate {
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 100 })
  action: string;

  @Index()
  @Column({ type: 'varchar', length: 100 })
  entityType: string;

  @Index()
  @Column({ type: 'varchar', length: 100, nullable: true })
  entityId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  oldData: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  newData: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;
}
