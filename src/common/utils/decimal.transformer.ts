import { ValueTransformer } from 'typeorm';
import Decimal from 'decimal.js';

/**
 * Maps a PostgreSQL numeric(18,2) column to a Decimal instance so business
 * logic never touches money as a JS float.
 */
export class DecimalTransformer implements ValueTransformer {
  to(data?: Decimal | number | string | null): string | null {
    if (data === null || data === undefined) return null;
    return new Decimal(data).toFixed(2);
  }

  from(data?: string | null): Decimal | null {
    if (data === null || data === undefined) return null;
    return new Decimal(data);
  }
}

export const decimalColumn = (options: { default?: string } = {}) => ({
  type: 'numeric' as const,
  precision: 18,
  scale: 2,
  transformer: new DecimalTransformer(),
  default: options.default,
});

export const ZERO = new Decimal(0);
