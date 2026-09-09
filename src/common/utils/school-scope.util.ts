import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

/**
 * Applies a school-scope restriction (from AccessControlService) to a query
 * builder. `schoolIds === null` means unrestricted — nothing is applied.
 * Returns false when the caller has no accessible schools at all, in which
 * case the query must not run at all (return an empty result instead).
 */
export function applySchoolScope<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  column: string,
  schoolIds: string[] | null,
): boolean {
  if (schoolIds === null) return true;
  if (schoolIds.length === 0) return false;
  qb.andWhere(`${column} IN (:...scopedSchoolIds)`, {
    scopedSchoolIds: schoolIds,
  });
  return true;
}
