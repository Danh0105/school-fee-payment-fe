import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A parent can ask for an e-invoice when creating a payment order. Only new
 * nullable columns: existing orders and invoices are untouched.
 */
export class ParentEInvoiceRequest1791784000000 implements MigrationInterface {
  name = 'ParentEInvoiceRequest1791784000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment_orders" ADD "invoice_email" varchar(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "einvoices" ADD "payment_order_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "einvoices" ADD "buyer_email" varchar(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "einvoices" ADD "email_sent_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_einvoices_payment_order" ON "einvoices" ("payment_order_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "einvoices" ADD CONSTRAINT "FK_einvoices_payment_order" FOREIGN KEY ("payment_order_id") REFERENCES "payment_orders"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    // Invoices issued before this migration: link them to the order their
    // payment is matched to.
    await queryRunner.query(
      `UPDATE "einvoices" e SET "payment_order_id" = r."payment_order_id"
         FROM "bank_reconciliations" r
        WHERE r."payment_transaction_id" = e."payment_id"
          AND r."payment_order_id" IS NOT NULL
          AND r."status" IN ('AUTO_MATCHED', 'MANUAL_MATCHED')
          AND e."payment_order_id" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "einvoices" DROP CONSTRAINT "FK_einvoices_payment_order"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_einvoices_payment_order"`,
    );
    await queryRunner.query(
      `ALTER TABLE "einvoices" DROP COLUMN "email_sent_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "einvoices" DROP COLUMN "buyer_email"`,
    );
    await queryRunner.query(
      `ALTER TABLE "einvoices" DROP COLUMN "payment_order_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_orders" DROP COLUMN "invoice_email"`,
    );
  }
}
