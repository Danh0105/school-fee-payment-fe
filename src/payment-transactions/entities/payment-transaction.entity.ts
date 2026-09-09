import { Column, Entity, Index } from 'typeorm';
import Decimal from 'decimal.js';
import { BaseEntityNoUpdate } from '../../common/entities/base.entity';
import {
  PaymentProviderCode,
  PaymentTransactionStatus,
} from '../../common/enums/status.enum';
import { decimalColumn } from '../../common/utils/decimal.transformer';

@Entity('payment_transactions')
@Index(['provider', 'externalTransactionId'], { unique: true })
export class PaymentTransaction extends BaseEntityNoUpdate {
  @Column({ type: 'uuid' })
  schoolId: string;

  @Column({ type: 'enum', enum: PaymentProviderCode })
  provider: PaymentProviderCode;

  @Column({ type: 'varchar', length: 255 })
  externalTransactionId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  bankTransactionId: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  bankCode: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  bankAccountNumber: string | null;

  @Column(decimalColumn())
  amount: Decimal;

  @Index()
  @Column({ type: 'varchar', length: 500, nullable: true })
  transferContent: string | null;

  @Index()
  @Column({ type: 'timestamptz' })
  transactionTime: Date;

  @Column({ type: 'jsonb', nullable: true })
  rawPayload: Record<string, unknown> | null;

  @Column({
    type: 'enum',
    enum: PaymentTransactionStatus,
    default: PaymentTransactionStatus.RECEIVED,
  })
  status: PaymentTransactionStatus;
}
