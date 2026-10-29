import { MigrationInterface, QueryRunner } from 'typeorm';

export class UnlimitedPaymentOrderQr1791786000000 implements MigrationInterface {
  name = 'UnlimitedPaymentOrderQr1791786000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "payment_orders"
      SET "expires_at" = NULL
      WHERE "status" IN ('PENDING', 'PARTIALLY_PAID')
        AND "expires_at" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "payment_orders"
      SET "expires_at" = "created_at" + INTERVAL '30 days'
      WHERE "status" IN ('PENDING', 'PARTIALLY_PAID')
        AND "expires_at" IS NULL
    `);
  }
}
