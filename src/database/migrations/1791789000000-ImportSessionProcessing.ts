import { MigrationInterface, QueryRunner } from 'typeorm';

/** An import being saved is PROCESSING, so a second save cannot start. */
export class ImportSessionProcessing1791789000000 implements MigrationInterface {
  name = 'ImportSessionProcessing1791789000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."import_sessions_status_enum" ADD VALUE IF NOT EXISTS 'PROCESSING' AFTER 'PENDING_CONFIRMATION'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // A save cut short leaves PROCESSING behind; it can be saved again.
    await queryRunner.query(
      `UPDATE "import_sessions" SET "status" = 'PENDING_CONFIRMATION' WHERE "status" = 'PROCESSING'`,
    );
    // Postgres cannot drop an enum value: rebuild the type without it.
    await queryRunner.query(
      `ALTER TYPE "public"."import_sessions_status_enum" RENAME TO "import_sessions_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."import_sessions_status_enum" AS ENUM('PENDING_CONFIRMATION', 'CONFIRMED', 'EXPIRED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "import_sessions" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "import_sessions" ALTER COLUMN "status" TYPE "public"."import_sessions_status_enum" USING "status"::text::"public"."import_sessions_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "import_sessions" ALTER COLUMN "status" SET DEFAULT 'PENDING_CONFIRMATION'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."import_sessions_status_enum_old"`,
    );
  }
}
