import { MigrationInterface, QueryRunner } from 'typeorm';

/** Invoice data captured from each imported collection-list row. */
export class ReceivableInvoiceDetails1791788000000 implements MigrationInterface {
  name = 'ReceivableInvoiceDetails1791788000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "student_receivables" ADD "invoice_buyer_name" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_receivables" ADD "invoice_buyer_address" character varying(1200)`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_receivables" ADD "invoice_buyer_id_no" character varying(200)`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_receivables" ADD "invoice_unit_name" character varying(300)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "student_receivables" DROP COLUMN "invoice_unit_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_receivables" DROP COLUMN "invoice_buyer_id_no"`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_receivables" DROP COLUMN "invoice_buyer_address"`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_receivables" DROP COLUMN "invoice_buyer_name"`,
    );
  }
}
