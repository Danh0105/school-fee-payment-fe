import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds VIETINBANK as a valid provider/payment-method value alongside the
 * existing VietQR-aggregator and manual-bank options (see
 * src/viettinbank/ and payment-providers/providers/viettinbank.provider.ts).
 */
export class AddVietinbankProvider1789100000000 implements MigrationInterface {
  name = 'AddVietinbankProvider1789100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."payment_transactions_provider_enum" ADD VALUE IF NOT EXISTS 'VIETINBANK'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."payment_orders_payment_method_enum" ADD VALUE IF NOT EXISTS 'VIETINBANK'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."receipts_payment_method_enum" ADD VALUE IF NOT EXISTS 'VIETINBANK'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres cannot drop a single enum value without recreating the type
    // and rewriting every dependent column; left as a no-op, matching the
    // convention for additive enum migrations elsewhere in this project.
  }
}
