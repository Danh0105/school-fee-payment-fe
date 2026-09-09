import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

/**
 * Generates gap-free, concurrency-safe sequential numbers for business codes
 * (payment order code, receipt number, receivable code, ...) using an
 * upsert-and-increment on a dedicated sequence table. Safe under concurrent
 * webhook/API calls because the increment happens atomically in Postgres.
 */
@Injectable()
export class SequenceService {
  constructor(private readonly dataSource: DataSource) {}

  async next(scopeKey: string, manager?: EntityManager): Promise<number> {
    const runner = manager ?? this.dataSource.manager;
    const result: Array<{ last_value: string }> = await runner.query(
      `INSERT INTO number_sequences (scope_key, last_value)
       VALUES ($1, 1)
       ON CONFLICT (scope_key)
       DO UPDATE SET last_value = number_sequences.last_value + 1
       RETURNING last_value`,
      [scopeKey],
    );
    return Number(result[0].last_value);
  }

  async generateCode(prefix: string, scopeKey: string, pad: number, manager?: EntityManager): Promise<string> {
    const seq = await this.next(scopeKey, manager);
    return `${prefix}${String(seq).padStart(pad, '0')}`;
  }
}
