/** Converts an unknown webhook/JSON field to a string without triggering unsafe Object stringification. */
export function toSafeString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (value === null || value === undefined) return '';
  return JSON.stringify(value);
}
