import { MigrationInterface, QueryRunner } from 'typeorm';

/** Idempotency key for payment orders: one order per (student, key). */
export class PaymentOrderClientRequestId1791785000000 implements MigrationInterface {
  name = 'PaymentOrderClientRequestId1791785000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment_orders" ADD "client_request_id" varchar(100)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_payment_orders_student_client_request" ON "payment_orders" ("student_id", "client_request_id") WHERE "client_request_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."UQ_payment_orders_student_client_request"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_orders" DROP COLUMN "client_request_id"`,
    );
  }
}
