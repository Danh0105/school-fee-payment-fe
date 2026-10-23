import { MigrationInterface, QueryRunner } from 'typeorm';

/** Payment-list import choices: create debts/orders, QR expiry, list title. */
export class ImportPaymentOptions1791787000000 implements MigrationInterface {
  name = 'ImportPaymentOptions1791787000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "import_sessions" ADD "payment_options" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "import_sessions" DROP COLUMN "payment_options"`,
    );
  }
}
