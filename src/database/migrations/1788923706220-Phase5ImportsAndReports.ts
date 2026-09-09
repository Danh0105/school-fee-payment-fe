import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase5ImportsAndReports1788923706220 implements MigrationInterface {
  name = 'Phase5ImportsAndReports1788923706220';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."import_sessions_type_enum" AS ENUM('STUDENTS', 'RECEIVABLES', 'COMBINED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."import_sessions_status_enum" AS ENUM('PENDING_CONFIRMATION', 'CONFIRMED', 'EXPIRED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "import_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "academic_year_id" uuid NOT NULL, "fee_plan_id" uuid, "type" "public"."import_sessions_type_enum" NOT NULL, "file_name" character varying(255) NOT NULL, "total_rows" integer NOT NULL, "valid_row_count" integer NOT NULL, "invalid_row_count" integer NOT NULL, "valid_rows" jsonb NOT NULL, "errors" jsonb NOT NULL, "status" "public"."import_sessions_status_enum" NOT NULL DEFAULT 'PENDING_CONFIRMATION', "created_by" uuid NOT NULL, "confirm_result" jsonb, CONSTRAINT "PK_d1e679263b8401aa5ff3fb583fe" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "import_sessions"`);
    await queryRunner.query(`DROP TYPE "public"."import_sessions_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."import_sessions_type_enum"`);
  }
}
