import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A fee plan billed as MONTHLY now expands into one receivable per semester
 * (HK1 + HK2) so a parent can pay per-semester instead of only the whole
 * year. That means (studentId, feePlanId) is no longer unique on its own —
 * uniqueness must include semesterId. Postgres treats NULL != NULL in a
 * plain unique index, which would let ONE_TIME plans (semesterId always
 * NULL) be assigned twice, so the replacement index coalesces NULL to a
 * fixed sentinel UUID to keep the original single-row-per-plan guarantee.
 */
export class SplitReceivablesBySemester1789007000000 implements MigrationInterface {
  name = 'SplitReceivablesBySemester1789007000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_student_receivables_student_id_fee_plan_id"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_student_receivables_student_plan_semester" ON "student_receivables" ("student_id", "fee_plan_id", COALESCE("semester_id", '00000000-0000-0000-0000-000000000000'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_student_receivables_student_plan_semester"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_student_receivables_student_id_fee_plan_id" ON "student_receivables" ("student_id", "fee_plan_id")`,
    );
  }
}
