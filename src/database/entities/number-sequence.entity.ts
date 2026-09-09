import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('number_sequences')
export class NumberSequence {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  scopeKey: string;

  @Column({ type: 'bigint', default: 0 })
  lastValue: string;
}
