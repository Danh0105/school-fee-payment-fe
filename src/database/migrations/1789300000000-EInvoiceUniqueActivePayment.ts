import { MigrationInterface, QueryRunner } from 'typeorm';

export class EInvoiceUniqueActivePayment1789300000000 implements MigrationInterface {
  name = 'EInvoiceUniqueActivePayment1789300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "einvoices" DROP CONSTRAINT "UQ_einvoices_payment"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_einvoices_payment_active" ON "einvoices" ("payment_id") WHERE "status" <> 'CANCELLED'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."UQ_einvoices_payment_active"`,
    );
    await queryRunner.query(
      `ALTER TABLE "einvoices" ADD CONSTRAINT "UQ_einvoices_payment" UNIQUE ("payment_id")`,
    );
  }
}
