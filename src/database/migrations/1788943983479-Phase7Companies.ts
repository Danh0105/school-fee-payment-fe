import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase7Companies1788943983479 implements MigrationInterface {
  name = 'Phase7Companies1788943983479';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."companies_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "companies" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "code" character varying(50) NOT NULL, "name" character varying(255) NOT NULL, "tax_code" character varying(30), "address" character varying(500), "phone" character varying(30), "contact_email" character varying(255), "status" "public"."companies_status_enum" NOT NULL DEFAULT 'ACTIVE', "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_d4bc3e82a314fa9e29f652c2c22" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_companies_code" ON "companies" ("code") `,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "company_id" uuid`);
    await queryRunner.query(`ALTER TABLE "schools" ADD "company_id" uuid`);
    await queryRunner.query(
      `CREATE INDEX "IDX_schools_company_id" ON "schools" ("company_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "schools" ADD CONSTRAINT "FK_844defc08c3c85ff241e3277e14" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "schools" DROP CONSTRAINT "FK_844defc08c3c85ff241e3277e14"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_schools_company_id"`);
    await queryRunner.query(`ALTER TABLE "schools" DROP COLUMN "company_id"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "company_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_companies_code"`);
    await queryRunner.query(`DROP TABLE "companies"`);
    await queryRunner.query(`DROP TYPE "public"."companies_status_enum"`);
  }
}
