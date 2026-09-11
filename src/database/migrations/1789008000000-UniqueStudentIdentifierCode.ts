import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * identifierCode (CCCD/mã định danh) is now the sole credential for the
 * parent-portal lookup (school + identifierCode). It previously had only a
 * plain, non-unique index, which let duplicate codes silently produce an
 * unusable "ambiguous match" for parents. Enforce uniqueness per school —
 * not globally, so one school's bad data can never block a different
 * school's onboarding. Nullable-safe: Postgres doesn't count two NULLs as
 * a duplicate, so students without a code yet are unaffected.
 */
export class UniqueStudentIdentifierCode1789008000000 implements MigrationInterface {
  name = 'UniqueStudentIdentifierCode1789008000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_students_identifier_code"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_students_school_id_identifier_code" ON "students" ("school_id", "identifier_code")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_students_school_id_identifier_code"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_students_identifier_code" ON "students" ("identifier_code")`,
    );
  }
}
