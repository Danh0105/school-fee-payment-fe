import { MigrationInterface, QueryRunner } from 'typeorm';

export class ViettelSinvoice1789200000000 implements MigrationInterface {
  name = 'ViettelSinvoice1789200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."einvoices_status_enum" AS ENUM('PENDING','QUEUED','PROCESSING','WAITING_INVOICE_NUMBER','ISSUED','FILE_PENDING','COMPLETED','FAILED','CANCELLED','ADJUSTED','REPLACED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."einvoice_attempts_operation_enum" AS ENUM('ISSUE','RECONCILE','DOWNLOAD','SEND_EMAIL','CANCEL','UPDATE_PAYMENT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."einvoice_attempts_status_enum" AS ENUM('STARTED','SUCCEEDED','FAILED')`,
    );

    await queryRunner.query(`CREATE TABLE "einvoice_configs" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "school_id" uuid NOT NULL,
      "provider" varchar(30) NOT NULL DEFAULT 'VIETTEL',
      "enabled" boolean NOT NULL DEFAULT false,
      "auto_issue" boolean NOT NULL DEFAULT true,
      "supplier_tax_code" varchar(20) NOT NULL,
      "template_code" varchar(20) NOT NULL,
      "invoice_series" varchar(25) NOT NULL,
      "currency_code" varchar(3) NOT NULL DEFAULT 'VND',
      "tax_percentage" numeric(5,2),
      "prices_include_tax" boolean,
      "signing_mode" varchar(30) NOT NULL DEFAULT 'HSM',
      "metadata" jsonb,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_einvoice_configs" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_einvoice_configs_school" UNIQUE ("school_id"),
      CONSTRAINT "FK_einvoice_configs_school" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE
    )`);

    await queryRunner.query(`CREATE TABLE "einvoices" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "school_id" uuid NOT NULL,
      "provider" varchar(30) NOT NULL DEFAULT 'VIETTEL',
      "payment_id" uuid NOT NULL,
      "receipt_id" uuid NOT NULL,
      "student_id" uuid NOT NULL,
      "supplier_tax_code" varchar(20) NOT NULL,
      "template_code" varchar(20) NOT NULL,
      "invoice_series" varchar(25) NOT NULL,
      "invoice_no" varchar(50),
      "transaction_uuid" uuid NOT NULL,
      "transaction_id" varchar(100),
      "reservation_code" varchar(100),
      "code_of_tax" varchar(100),
      "invoice_type" varchar(30),
      "adjustment_type" varchar(10) NOT NULL DEFAULT '1',
      "original_invoice_id" uuid,
      "status" "public"."einvoices_status_enum" NOT NULL DEFAULT 'PENDING',
      "error_code" varchar(100),
      "error_description" text,
      "raw_request" jsonb,
      "raw_response" jsonb,
      "reconciliation_attempts" integer NOT NULL DEFAULT 0,
      "issued_at" timestamptz,
      CONSTRAINT "PK_einvoices" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_einvoices_transaction_uuid" UNIQUE ("transaction_uuid"),
      CONSTRAINT "UQ_einvoices_payment" UNIQUE ("payment_id"),
      CONSTRAINT "UQ_einvoices_receipt" UNIQUE ("receipt_id"),
      CONSTRAINT "FK_einvoices_school" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_einvoices_payment" FOREIGN KEY ("payment_id") REFERENCES "payment_transactions"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_einvoices_receipt" FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_einvoices_student" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_einvoices_original" FOREIGN KEY ("original_invoice_id") REFERENCES "einvoices"("id") ON DELETE SET NULL
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_einvoices_school" ON "einvoices" ("school_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_einvoices_student" ON "einvoices" ("student_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_einvoices_status" ON "einvoices" ("status")`,
    );

    await queryRunner.query(`CREATE TABLE "einvoice_attempts" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" timestamptz NOT NULL DEFAULT now(),
      "invoice_id" uuid NOT NULL, "operation" "public"."einvoice_attempts_operation_enum" NOT NULL,
      "status" "public"."einvoice_attempts_status_enum" NOT NULL, "request_id" varchar(100) NOT NULL,
      "endpoint" varchar(500) NOT NULL, "http_status" integer, "error_code" varchar(100),
      "error_description" text, "retryable" boolean NOT NULL DEFAULT false, "duration_ms" integer,
      CONSTRAINT "PK_einvoice_attempts" PRIMARY KEY ("id"),
      CONSTRAINT "FK_einvoice_attempts_invoice" FOREIGN KEY ("invoice_id") REFERENCES "einvoices"("id") ON DELETE CASCADE
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_einvoice_attempts_invoice" ON "einvoice_attempts" ("invoice_id")`,
    );

    await queryRunner.query(`CREATE TABLE "einvoice_files" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" timestamptz NOT NULL DEFAULT now(),
      "invoice_id" uuid NOT NULL, "file_type" varchar(10) NOT NULL, "file_name" varchar(255) NOT NULL,
      "storage_path" varchar(1000) NOT NULL, "mime_type" varchar(100) NOT NULL, "size" bigint NOT NULL,
      "provider" varchar(30) NOT NULL DEFAULT 'VIETTEL',
      CONSTRAINT "PK_einvoice_files" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_einvoice_files_type" UNIQUE ("invoice_id", "file_type"),
      CONSTRAINT "FK_einvoice_files_invoice" FOREIGN KEY ("invoice_id") REFERENCES "einvoices"("id") ON DELETE CASCADE
    )`);

    await queryRunner.query(`CREATE TABLE "einvoice_events" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" timestamptz NOT NULL DEFAULT now(),
      "invoice_id" uuid NOT NULL, "event_type" varchar(100) NOT NULL, "payload" jsonb,
      CONSTRAINT "PK_einvoice_events" PRIMARY KEY ("id"),
      CONSTRAINT "FK_einvoice_events_invoice" FOREIGN KEY ("invoice_id") REFERENCES "einvoices"("id") ON DELETE CASCADE
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_einvoice_events_invoice" ON "einvoice_events" ("invoice_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "einvoice_events"`);
    await queryRunner.query(`DROP TABLE "einvoice_files"`);
    await queryRunner.query(`DROP TABLE "einvoice_attempts"`);
    await queryRunner.query(`DROP TABLE "einvoices"`);
    await queryRunner.query(`DROP TABLE "einvoice_configs"`);
    await queryRunner.query(
      `DROP TYPE "public"."einvoice_attempts_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."einvoice_attempts_operation_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."einvoices_status_enum"`);
  }
}
