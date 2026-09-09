import { Column, Entity, Index } from 'typeorm';
import { BaseEntityNoUpdate } from '../../common/entities/base.entity';

export enum NotificationChannel {
  ZALO_ZNS = 'ZALO_ZNS',
}

export enum NotificationStatus {
  SENT = 'SENT',
  FAILED = 'FAILED',
}

/**
 * Append-only record of every outbound parent notification attempt — needed
 * to answer "did the parent actually get the QR" without trusting Zalo's
 * side, and to avoid silently swallowing delivery failures.
 */
@Entity('notification_logs')
export class NotificationLog extends BaseEntityNoUpdate {
  @Column({ type: 'enum', enum: NotificationChannel })
  channel: NotificationChannel;

  @Index()
  @Column({ type: 'varchar', length: 30 })
  recipientPhone: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  templateId: string | null;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'enum', enum: NotificationStatus })
  status: NotificationStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  providerMessageId: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  errorMessage: string | null;

  @Index()
  @Column({ type: 'varchar', length: 50 })
  referenceType: string;

  @Index()
  @Column({ type: 'uuid' })
  referenceId: string;

  @Column({ type: 'uuid', nullable: true })
  sentBy: string | null;
}
