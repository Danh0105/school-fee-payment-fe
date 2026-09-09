import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase2Fees1788921185290 implements MigrationInterface {
  name = 'Phase2Fees1788921185290';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."fee_categories_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "fee_categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "code" character varying(30) NOT NULL, "name" character varying(255) NOT NULL, "description" character varying(500), "accounting_code" character varying(50), "status" "public"."fee_categories_status_enum" NOT NULL DEFAULT 'ACTIVE', "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_04f6b37df364d3c8b06e957a59c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_fee_categories_school_id_code" ON "fee_categories" ("school_id", "code") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."fee_plans_billing_type_enum" AS ENUM('ONE_TIME', 'MONTHLY', 'CUSTOM')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."fee_plans_status_enum" AS ENUM('DRAFT', 'ACTIVE', 'CLOSED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "fee_plans" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "academic_year_id" uuid NOT NULL, "semester_id" uuid, "fee_category_id" uuid NOT NULL, "code" character varying(50) NOT NULL, "name" character varying(255) NOT NULL, "description" character varying(1000), "billing_type" "public"."fee_plans_billing_type_enum" NOT NULL DEFAULT 'ONE_TIME', "unit_price" numeric(18,2) NOT NULL, "quantity" numeric(10,2) NOT NULL DEFAULT '1', "default_amount" numeric(18,2) NOT NULL, "start_date" date, "due_date" date, "status" "public"."fee_plans_status_enum" NOT NULL DEFAULT 'DRAFT', "created_by" uuid, CONSTRAINT "PK_b2e3f4eab7f5092165f10bc0d01" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_fee_plans_school_id_academic_year_id_code" ON "fee_plans" ("school_id", "academic_year_id", "code") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."student_receivables_status_enum" AS ENUM('DRAFT', 'UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "student_receivables" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "student_id" uuid NOT NULL, "academic_year_id" uuid NOT NULL, "semester_id" uuid, "fee_plan_id" uuid NOT NULL, "receivable_code" character varying(50) NOT NULL, "description" character varying(500), "quantity" numeric(10,2) NOT NULL, "unit_price" numeric(18,2) NOT NULL, "original_amount" numeric(18,2) NOT NULL, "discount_amount" numeric(18,2) NOT NULL DEFAULT '0', "adjustment_amount" numeric(18,2) NOT NULL DEFAULT '0', "amount_due" numeric(18,2) NOT NULL, "amount_paid" numeric(18,2) NOT NULL DEFAULT '0', "amount_outstanding" numeric(18,2) NOT NULL, "due_date" date, "status" "public"."student_receivables_status_enum" NOT NULL DEFAULT 'UNPAID', "created_by" uuid, CONSTRAINT "PK_df8d0dc4586e8d5f7e834f86f9f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_student_receivables_receivable_code" ON "student_receivables" ("receivable_code") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_student_receivables_due_date" ON "student_receivables" ("due_date") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_student_receivables_status" ON "student_receivables" ("status") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_student_receivables_student_id_fee_plan_id" ON "student_receivables" ("student_id", "fee_plan_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."student_ledger_entries_entry_type_enum" AS ENUM('RECEIVABLE', 'PAYMENT', 'DISCOUNT', 'ADJUSTMENT_INCREASE', 'ADJUSTMENT_DECREASE', 'REFUND', 'CREDIT', 'REVERSAL')`,
    );
    await queryRunner.query(
      `CREATE TABLE "student_ledger_entries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "student_id" uuid NOT NULL, "entry_type" "public"."student_ledger_entries_entry_type_enum" NOT NULL, "reference_type" character varying(50) NOT NULL, "reference_id" uuid NOT NULL, "debit_amount" numeric(18,2) NOT NULL DEFAULT '0', "credit_amount" numeric(18,2) NOT NULL DEFAULT '0', "description" character varying(500) NOT NULL, "posting_date" date NOT NULL, "created_by" uuid, CONSTRAINT "PK_53e9c26e8f815d3ce01e4d92501" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_student_ledger_entries_student_id" ON "student_ledger_entries" ("student_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."fee_assignments_target_type_enum" AS ENUM('SCHOOL', 'GRADE', 'CLASS', 'STUDENT')`,
    );
    await queryRunner.query(
      `CREATE TABLE "fee_assignments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "fee_plan_id" uuid NOT NULL, "target_type" "public"."fee_assignments_target_type_enum" NOT NULL, "target_id" character varying(100), "created_by" uuid, CONSTRAINT "PK_5d52331b84e42c325461e73d798" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."student_discounts_type_enum" AS ENUM('FIXED_AMOUNT', 'PERCENTAGE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "student_discounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "student_id" uuid NOT NULL, "receivable_id" uuid NOT NULL, "type" "public"."student_discounts_type_enum" NOT NULL, "value" numeric(18,2) NOT NULL, "amount" numeric(18,2) NOT NULL, "reason" character varying(500) NOT NULL, "approved_by" uuid, "approved_at" TIMESTAMP WITH TIME ZONE, "created_by" uuid, CONSTRAINT "PK_d9791052660736e702c448d15cc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."receivable_adjustments_type_enum" AS ENUM('INCREASE', 'DECREASE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."receivable_adjustments_status_enum" AS ENUM('DRAFT', 'APPROVED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "receivable_adjustments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "receivable_id" uuid NOT NULL, "adjustment_code" character varying(50) NOT NULL, "type" "public"."receivable_adjustments_type_enum" NOT NULL, "amount" numeric(18,2) NOT NULL, "reason" character varying(500) NOT NULL, "status" "public"."receivable_adjustments_status_enum" NOT NULL DEFAULT 'DRAFT', "created_by" uuid, "approved_by" uuid, "approved_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_e925e73f30761a61bd960b27bbf" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_receivable_adjustments_adjustment_code" ON "receivable_adjustments" ("adjustment_code") `,
    );
    await queryRunner.query(
      `ALTER TABLE "fee_categories" ADD CONSTRAINT "FK_c4cf9799c2377cf705783de565d" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "fee_plans" ADD CONSTRAINT "FK_944392bc0bb7a53e1d04f300dc6" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "fee_plans" ADD CONSTRAINT "FK_e50f9773df877e7e02d7b0a671d" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "fee_plans" ADD CONSTRAINT "FK_c2a7dca119e48d39a45ed2663b4" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "fee_plans" ADD CONSTRAINT "FK_0f767e2b9ee77d610fec05dfe51" FOREIGN KEY ("fee_category_id") REFERENCES "fee_categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_receivables" ADD CONSTRAINT "FK_e35c0ab1e5ab494c6cfc4370891" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_receivables" ADD CONSTRAINT "FK_a78a74f37eb89ece7c8fb242f02" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_receivables" ADD CONSTRAINT "FK_9d71f88e7e1f31f3252566bcd5a" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_receivables" ADD CONSTRAINT "FK_a9ef2981bd2695d0b25f10b77aa" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_receivables" ADD CONSTRAINT "FK_6ba5dd17fb6594202a6e2c36641" FOREIGN KEY ("fee_plan_id") REFERENCES "fee_plans"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "fee_assignments" ADD CONSTRAINT "FK_d8d28d38fcb0e19df07b108e5ae" FOREIGN KEY ("fee_plan_id") REFERENCES "fee_plans"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_discounts" ADD CONSTRAINT "FK_55cb3baeb2f1cfea0bacc7cb4f1" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_discounts" ADD CONSTRAINT "FK_97dc09413869d8b08e2c8dc3a89" FOREIGN KEY ("receivable_id") REFERENCES "student_receivables"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "receivable_adjustments" ADD CONSTRAINT "FK_f4f9917d71061c1a3fea1c00a19" FOREIGN KEY ("receivable_id") REFERENCES "student_receivables"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "receivable_adjustments" DROP CONSTRAINT "FK_f4f9917d71061c1a3fea1c00a19"`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_discounts" DROP CONSTRAINT "FK_97dc09413869d8b08e2c8dc3a89"`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_discounts" DROP CONSTRAINT "FK_55cb3baeb2f1cfea0bacc7cb4f1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fee_assignments" DROP CONSTRAINT "FK_d8d28d38fcb0e19df07b108e5ae"`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_receivables" DROP CONSTRAINT "FK_6ba5dd17fb6594202a6e2c36641"`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_receivables" DROP CONSTRAINT "FK_a9ef2981bd2695d0b25f10b77aa"`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_receivables" DROP CONSTRAINT "FK_9d71f88e7e1f31f3252566bcd5a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_receivables" DROP CONSTRAINT "FK_a78a74f37eb89ece7c8fb242f02"`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_receivables" DROP CONSTRAINT "FK_e35c0ab1e5ab494c6cfc4370891"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fee_plans" DROP CONSTRAINT "FK_0f767e2b9ee77d610fec05dfe51"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fee_plans" DROP CONSTRAINT "FK_c2a7dca119e48d39a45ed2663b4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fee_plans" DROP CONSTRAINT "FK_e50f9773df877e7e02d7b0a671d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fee_plans" DROP CONSTRAINT "FK_944392bc0bb7a53e1d04f300dc6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fee_categories" DROP CONSTRAINT "FK_c4cf9799c2377cf705783de565d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_receivable_adjustments_adjustment_code"`,
    );
    await queryRunner.query(`DROP TABLE "receivable_adjustments"`);
    await queryRunner.query(
      `DROP TYPE "public"."receivable_adjustments_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."receivable_adjustments_type_enum"`,
    );
    await queryRunner.query(`DROP TABLE "student_discounts"`);
    await queryRunner.query(`DROP TYPE "public"."student_discounts_type_enum"`);
    await queryRunner.query(`DROP TABLE "fee_assignments"`);
    await queryRunner.query(
      `DROP TYPE "public"."fee_assignments_target_type_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_student_ledger_entries_student_id"`,
    );
    await queryRunner.query(`DROP TABLE "student_ledger_entries"`);
    await queryRunner.query(
      `DROP TYPE "public"."student_ledger_entries_entry_type_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_student_receivables_student_id_fee_plan_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_student_receivables_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_student_receivables_due_date"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_student_receivables_receivable_code"`,
    );
    await queryRunner.query(`DROP TABLE "student_receivables"`);
    await queryRunner.query(
      `DROP TYPE "public"."student_receivables_status_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fee_plans_school_id_academic_year_id_code"`,
    );
    await queryRunner.query(`DROP TABLE "fee_plans"`);
    await queryRunner.query(`DROP TYPE "public"."fee_plans_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."fee_plans_billing_type_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fee_categories_school_id_code"`,
    );
    await queryRunner.query(`DROP TABLE "fee_categories"`);
    await queryRunner.query(`DROP TYPE "public"."fee_categories_status_enum"`);
  }
}
