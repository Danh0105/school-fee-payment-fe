import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase3Indexes1788922392940 implements MigrationInterface {
  name = 'Phase3Indexes1788922392940';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_student_classes_class_id" ON "student_classes" ("class_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_student_receivables_fee_plan_id" ON "student_receivables" ("fee_plan_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_allocations_payment_transaction_id" ON "payment_allocations" ("payment_transaction_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_allocations_receivable_id" ON "payment_allocations" ("receivable_id") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_payment_allocations_receivable_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_payment_allocations_payment_transaction_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_student_receivables_fee_plan_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_student_classes_class_id"`,
    );
  }
}
