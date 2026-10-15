import { MigrationInterface, QueryRunner } from 'typeorm';

const STATUSES_BEFORE_DRAFT = [
  'PENDING',
  'QUEUED',
  'PROCESSING',
  'WAITING_INVOICE_NUMBER',
  'ISSUED',
  'FILE_PENDING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'ADJUSTED',
  'REPLACED',
];

export class EInvoiceDraftMode1791783000000 implements MigrationInterface {
  name = 'EInvoiceDraftMode1791783000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."einvoices_status_enum" ADD VALUE IF NOT EXISTS 'DRAFT' AFTER 'PROCESSING'`,
    );
    // Existing schools move to drafts too: nothing is issued without the accountant.
    await queryRunner.query(
      `ALTER TABLE "einvoice_configs" ADD "issue_mode" varchar(10) NOT NULL DEFAULT 'DRAFT'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [{ count }] = (await queryRunner.query(
      `SELECT count(*)::int AS count FROM "einvoices" WHERE "status" = 'DRAFT'`,
    )) as { count: number }[];
    if (count > 0) {
      throw new Error(
        `Còn ${count} hóa đơn trạng thái DRAFT; xử lý (đồng bộ hoặc hủy) trước khi revert`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "einvoice_configs" DROP COLUMN "issue_mode"`,
    );
    // Postgres cannot drop an enum value: rebuild the type without it. The
    // partial index compares status to a literal of the old type, so it is
    // recreated around the column change.
    await queryRunner.query(
      `DROP INDEX "public"."UQ_einvoices_payment_active"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."einvoices_status_enum" RENAME TO "einvoices_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."einvoices_status_enum" AS ENUM(${STATUSES_BEFORE_DRAFT.map((s) => `'${s}'`).join(',')})`,
    );
    await queryRunner.query(
      `ALTER TABLE "einvoices" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "einvoices" ALTER COLUMN "status" TYPE "public"."einvoices_status_enum" USING "status"::text::"public"."einvoices_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "einvoices" ALTER COLUMN "status" SET DEFAULT 'PENDING'`,
    );
    await queryRunner.query(`DROP TYPE "public"."einvoices_status_enum_old"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_einvoices_payment_active" ON "einvoices" ("payment_id") WHERE "status" <> 'CANCELLED'`,
    );
  }
}
