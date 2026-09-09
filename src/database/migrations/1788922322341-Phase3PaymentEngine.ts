import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase3PaymentEngine1788922322341 implements MigrationInterface {
  name = 'Phase3PaymentEngine1788922322341';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."student_credits_status_enum" AS ENUM('AVAILABLE', 'HELD', 'REFUNDED', 'ALLOCATED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "student_credits" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "student_id" uuid NOT NULL, "source_payment_transaction_id" uuid NOT NULL, "amount" numeric(18,2) NOT NULL, "remaining_amount" numeric(18,2) NOT NULL, "status" "public"."student_credits_status_enum" NOT NULL DEFAULT 'AVAILABLE', "note" character varying(500), CONSTRAINT "PK_5872a8c2edd5f8562a126990c6e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_student_credits_student_id" ON "student_credits" ("student_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payment_transactions_provider_enum" AS ENUM('VIETQR', 'MANUAL_BANK')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payment_transactions_status_enum" AS ENUM('RECEIVED', 'MATCHED', 'UNMATCHED', 'ALLOCATED', 'REVERSED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "payment_transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "provider" "public"."payment_transactions_provider_enum" NOT NULL, "external_transaction_id" character varying(255) NOT NULL, "bank_transaction_id" character varying(255), "bank_code" character varying(30), "bank_account_number" character varying(50), "amount" numeric(18,2) NOT NULL, "transfer_content" character varying(500), "transaction_time" TIMESTAMP WITH TIME ZONE NOT NULL, "raw_payload" jsonb, "status" "public"."payment_transactions_status_enum" NOT NULL DEFAULT 'RECEIVED', CONSTRAINT "PK_d32b3c6b0d2c1d22604cbcc8c49" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_transactions_transfer_content" ON "payment_transactions" ("transfer_content") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_transactions_transaction_time" ON "payment_transactions" ("transaction_time") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_payment_transactions_provider_external_transaction_id" ON "payment_transactions" ("provider", "external_transaction_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "receipt_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "receipt_id" uuid NOT NULL, "receivable_id" uuid, "description" character varying(500) NOT NULL, "amount" numeric(18,2) NOT NULL, CONSTRAINT "PK_8633ef98a0b970a980ebfd246e6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."receipts_payment_method_enum" AS ENUM('BANK_TRANSFER', 'VIETQR', 'CASH', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."receipts_status_enum" AS ENUM('ISSUED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "receipts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "student_id" uuid NOT NULL, "receipt_number" character varying(30) NOT NULL, "payment_transaction_id" uuid, "total_amount" numeric(18,2) NOT NULL, "payment_method" "public"."receipts_payment_method_enum" NOT NULL, "payer_name" character varying(255), "payer_phone" character varying(30), "description" character varying(500), "status" "public"."receipts_status_enum" NOT NULL DEFAULT 'ISSUED', "issued_at" TIMESTAMP WITH TIME ZONE NOT NULL, "issued_by" uuid, "cancelled_at" TIMESTAMP WITH TIME ZONE, "cancelled_by" uuid, "cancel_reason" character varying(500), CONSTRAINT "PK_5e8182d7c29e023da6e1ff33bfe" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_receipts_student_id" ON "receipts" ("student_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_receipts_receipt_number" ON "receipts" ("receipt_number") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."refunds_status_enum" AS ENUM('REQUESTED', 'APPROVED', 'COMPLETED', 'REJECTED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "refunds" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "refund_code" character varying(30) NOT NULL, "student_id" uuid NOT NULL, "payment_transaction_id" uuid NOT NULL, "receipt_id" uuid, "amount" numeric(18,2) NOT NULL, "reason" character varying(500) NOT NULL, "status" "public"."refunds_status_enum" NOT NULL DEFAULT 'REQUESTED', "requested_by" uuid NOT NULL, "approved_by" uuid, "approved_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_5106efb01eeda7e49a78b869738" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_refunds_refund_code" ON "refunds" ("refund_code") `,
    );
    await queryRunner.query(
      `CREATE TABLE "payment_order_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "payment_order_id" uuid NOT NULL, "receivable_id" uuid NOT NULL, "requested_amount" numeric(18,2) NOT NULL, CONSTRAINT "PK_4d6dc0dae1dc4f12a7be5e54b9c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payment_orders_status_enum" AS ENUM('PENDING', 'PAID', 'PARTIALLY_PAID', 'EXPIRED', 'CANCELLED', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payment_orders_payment_method_enum" AS ENUM('BANK_TRANSFER', 'VIETQR', 'CASH', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "payment_orders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "student_id" uuid NOT NULL, "order_code" character varying(30) NOT NULL, "requested_amount" numeric(18,2) NOT NULL, "status" "public"."payment_orders_status_enum" NOT NULL DEFAULT 'PENDING', "payment_method" "public"."payment_orders_payment_method_enum" NOT NULL DEFAULT 'VIETQR', "bank_code" character varying(30), "bank_account_number" character varying(50), "transfer_content" character varying(30) NOT NULL, "legacy_transfer_content" character varying(500), "qr_payload" text, "qr_url" character varying(1000), "expires_at" TIMESTAMP WITH TIME ZONE, "paid_at" TIMESTAMP WITH TIME ZONE, "created_by" uuid, CONSTRAINT "PK_158dd178010c39759305293a149" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_orders_student_id" ON "payment_orders" ("student_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_payment_orders_order_code" ON "payment_orders" ("order_code") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_orders_transfer_content" ON "payment_orders" ("transfer_content") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."bank_reconciliations_status_enum" AS ENUM('AUTO_MATCHED', 'MANUAL_MATCHED', 'UNMATCHED', 'AMOUNT_MISMATCH', 'DUPLICATE', 'REVERSED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "bank_reconciliations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "payment_transaction_id" uuid NOT NULL, "payment_order_id" uuid, "status" "public"."bank_reconciliations_status_enum" NOT NULL, "note" character varying(500), "matched_by" uuid, "matched_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_2616ee3f2acfae424b545a9d3be" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_bank_reconciliations_payment_transaction_id" ON "bank_reconciliations" ("payment_transaction_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bank_reconciliations_status" ON "bank_reconciliations" ("status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "payment_allocations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "payment_transaction_id" uuid NOT NULL, "payment_order_id" uuid, "receivable_id" uuid NOT NULL, "allocated_amount" numeric(18,2) NOT NULL, "reversed" boolean NOT NULL DEFAULT false, "created_by" uuid, CONSTRAINT "PK_a5c6ff22065ac772620c85f4efb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipt_items" ADD CONSTRAINT "FK_9f35634152710322f0296938400" FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipt_items" ADD CONSTRAINT "FK_9304a90f51474abe4beed7f9888" FOREIGN KEY ("receivable_id") REFERENCES "student_receivables"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" ADD CONSTRAINT "FK_f9a6db91c8ed2b7af02a034c8cc" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" ADD CONSTRAINT "FK_302f85a577487dd357ab96ee69d" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" ADD CONSTRAINT "FK_9c3f287ceb6d42e796d1bfb0d3b" FOREIGN KEY ("payment_transaction_id") REFERENCES "payment_transactions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "refunds" ADD CONSTRAINT "FK_f1e567ba67bf02168b8c101d717" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "refunds" ADD CONSTRAINT "FK_b304d742b0f1635a956e0b48464" FOREIGN KEY ("payment_transaction_id") REFERENCES "payment_transactions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "refunds" ADD CONSTRAINT "FK_54b1a3243772f31dbfbd407e968" FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_order_items" ADD CONSTRAINT "FK_c13ce87849bfc823beff4176bbc" FOREIGN KEY ("payment_order_id") REFERENCES "payment_orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_order_items" ADD CONSTRAINT "FK_44742c850cab371c54ac59c000a" FOREIGN KEY ("receivable_id") REFERENCES "student_receivables"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_orders" ADD CONSTRAINT "FK_25196faa3a65a1a0456089220bc" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_orders" ADD CONSTRAINT "FK_b87de3c6dd6255d0f97a40ab776" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "FK_8554d8475229202c73c6aa3c2c0" FOREIGN KEY ("payment_transaction_id") REFERENCES "payment_transactions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "FK_035c8d154694735c5a31fc3deed" FOREIGN KEY ("payment_order_id") REFERENCES "payment_orders"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_allocations" ADD CONSTRAINT "FK_9242e379a46b97c70b31a4b6f98" FOREIGN KEY ("payment_transaction_id") REFERENCES "payment_transactions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_allocations" ADD CONSTRAINT "FK_e19bbe3b92ca4eb8a1e57738bb2" FOREIGN KEY ("payment_order_id") REFERENCES "payment_orders"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_allocations" ADD CONSTRAINT "FK_6aa1be76742c6b2188845ac648c" FOREIGN KEY ("receivable_id") REFERENCES "student_receivables"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment_allocations" DROP CONSTRAINT "FK_6aa1be76742c6b2188845ac648c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_allocations" DROP CONSTRAINT "FK_e19bbe3b92ca4eb8a1e57738bb2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_allocations" DROP CONSTRAINT "FK_9242e379a46b97c70b31a4b6f98"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bank_reconciliations" DROP CONSTRAINT "FK_035c8d154694735c5a31fc3deed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bank_reconciliations" DROP CONSTRAINT "FK_8554d8475229202c73c6aa3c2c0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_orders" DROP CONSTRAINT "FK_b87de3c6dd6255d0f97a40ab776"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_orders" DROP CONSTRAINT "FK_25196faa3a65a1a0456089220bc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_order_items" DROP CONSTRAINT "FK_44742c850cab371c54ac59c000a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_order_items" DROP CONSTRAINT "FK_c13ce87849bfc823beff4176bbc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refunds" DROP CONSTRAINT "FK_54b1a3243772f31dbfbd407e968"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refunds" DROP CONSTRAINT "FK_b304d742b0f1635a956e0b48464"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refunds" DROP CONSTRAINT "FK_f1e567ba67bf02168b8c101d717"`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" DROP CONSTRAINT "FK_9c3f287ceb6d42e796d1bfb0d3b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" DROP CONSTRAINT "FK_302f85a577487dd357ab96ee69d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipts" DROP CONSTRAINT "FK_f9a6db91c8ed2b7af02a034c8cc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipt_items" DROP CONSTRAINT "FK_9304a90f51474abe4beed7f9888"`,
    );
    await queryRunner.query(
      `ALTER TABLE "receipt_items" DROP CONSTRAINT "FK_9f35634152710322f0296938400"`,
    );
    await queryRunner.query(`DROP TABLE "payment_allocations"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bank_reconciliations_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bank_reconciliations_payment_transaction_id"`,
    );
    await queryRunner.query(`DROP TABLE "bank_reconciliations"`);
    await queryRunner.query(
      `DROP TYPE "public"."bank_reconciliations_status_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_payment_orders_transfer_content"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_payment_orders_order_code"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_payment_orders_student_id"`,
    );
    await queryRunner.query(`DROP TABLE "payment_orders"`);
    await queryRunner.query(
      `DROP TYPE "public"."payment_orders_payment_method_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."payment_orders_status_enum"`);
    await queryRunner.query(`DROP TABLE "payment_order_items"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_refunds_refund_code"`);
    await queryRunner.query(`DROP TABLE "refunds"`);
    await queryRunner.query(`DROP TYPE "public"."refunds_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_receipts_receipt_number"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_receipts_student_id"`);
    await queryRunner.query(`DROP TABLE "receipts"`);
    await queryRunner.query(`DROP TYPE "public"."receipts_status_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."receipts_payment_method_enum"`,
    );
    await queryRunner.query(`DROP TABLE "receipt_items"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_payment_transactions_provider_external_transaction_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_payment_transactions_transaction_time"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_payment_transactions_transfer_content"`,
    );
    await queryRunner.query(`DROP TABLE "payment_transactions"`);
    await queryRunner.query(
      `DROP TYPE "public"."payment_transactions_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."payment_transactions_provider_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_student_credits_student_id"`,
    );
    await queryRunner.query(`DROP TABLE "student_credits"`);
    await queryRunner.query(`DROP TYPE "public"."student_credits_status_enum"`);
  }
}
