import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase8ZaloNotifications1788944483836 implements MigrationInterface {
  name = 'Phase8ZaloNotifications1788944483836';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "zalo_oauth_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "oa_id" character varying(100) NOT NULL, "access_token" text NOT NULL, "refresh_token" text NOT NULL, "access_token_expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_c034c4460aabcaedc51f7c5c610" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_zalo_oauth_tokens_oa_id" ON "zalo_oauth_tokens" ("oa_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notification_logs_channel_enum" AS ENUM('ZALO_ZNS')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notification_logs_status_enum" AS ENUM('SENT', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "notification_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "channel" "public"."notification_logs_channel_enum" NOT NULL, "recipient_phone" character varying(30) NOT NULL, "template_id" character varying(100), "payload" jsonb NOT NULL, "status" "public"."notification_logs_status_enum" NOT NULL, "provider_message_id" character varying(255), "error_message" character varying(1000), "reference_type" character varying(50) NOT NULL, "reference_id" uuid NOT NULL, "sent_by" uuid, CONSTRAINT "PK_19c524e644cdeaebfcffc284871" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_logs_recipient_phone" ON "notification_logs" ("recipient_phone") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_logs_reference_type" ON "notification_logs" ("reference_type") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notification_logs_reference_id" ON "notification_logs" ("reference_id") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_notification_logs_reference_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_notification_logs_reference_type"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_notification_logs_recipient_phone"`,
    );
    await queryRunner.query(`DROP TABLE "notification_logs"`);
    await queryRunner.query(
      `DROP TYPE "public"."notification_logs_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."notification_logs_channel_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_zalo_oauth_tokens_oa_id"`,
    );
    await queryRunner.query(`DROP TABLE "zalo_oauth_tokens"`);
  }
}
