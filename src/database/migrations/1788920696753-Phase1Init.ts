import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase1Init1788920696753 implements MigrationInterface {
  name = 'Phase1Init1788920696753';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TABLE "number_sequences" ("scope_key" character varying(100) NOT NULL, "last_value" bigint NOT NULL DEFAULT '0', CONSTRAINT "PK_cfbb34daa51aac938ba679b3044" PRIMARY KEY ("scope_key"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'CASHIER', 'VIEWER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "email" character varying(255) NOT NULL, "password_hash" character varying(255) NOT NULL, "full_name" character varying(255) NOT NULL, "role" "public"."users_role_enum" NOT NULL DEFAULT 'VIEWER', "school_id" uuid, "status" "public"."users_status_enum" NOT NULL DEFAULT 'ACTIVE', "refresh_token_hash" character varying(255), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_users_email" ON "users" ("email") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."schools_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "schools" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "code" character varying(50) NOT NULL, "name" character varying(255) NOT NULL, "address" character varying(500), "phone" character varying(30), "tax_code" character varying(30), "bank_name" character varying(255), "bank_code" character varying(30), "bank_account_number" character varying(50), "bank_account_name" character varying(255), "status" "public"."schools_status_enum" NOT NULL DEFAULT 'ACTIVE', "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_95b932e47ac129dd8e23a0db548" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_schools_code" ON "schools" ("code") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."students_gender_enum" AS ENUM('MALE', 'FEMALE', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."students_status_enum" AS ENUM('ACTIVE', 'INACTIVE', 'GRADUATED', 'TRANSFERRED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "students" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "student_code" character varying(50) NOT NULL, "identifier_code" character varying(50), "full_name" character varying(255) NOT NULL, "date_of_birth" date, "gender" "public"."students_gender_enum", "address" character varying(500), "phone" character varying(30), "parent_name" character varying(255), "parent_phone" character varying(30), "parent_email" character varying(255), "status" "public"."students_status_enum" NOT NULL DEFAULT 'ACTIVE', "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_7d7f07271ad4ce999880713f05e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_students_identifier_code" ON "students" ("identifier_code") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_students_school_id_student_code" ON "students" ("school_id", "student_code") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."academic_years_status_enum" AS ENUM('DRAFT', 'ACTIVE', 'CLOSED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "academic_years" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "name" character varying(50) NOT NULL, "start_date" date NOT NULL, "end_date" date NOT NULL, "status" "public"."academic_years_status_enum" NOT NULL DEFAULT 'DRAFT', CONSTRAINT "PK_2021b90bfbfa6c9da7df34ca1cf" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_academic_years_school_id_name" ON "academic_years" ("school_id", "name") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."classes_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "classes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "school_id" uuid NOT NULL, "academic_year_id" uuid NOT NULL, "code" character varying(20) NOT NULL, "name" character varying(100) NOT NULL, "grade" character varying(20), "status" "public"."classes_status_enum" NOT NULL DEFAULT 'ACTIVE', CONSTRAINT "PK_e207aa15404e9b2ce35910f9f7f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_classes_school_id_academic_year_id_code" ON "classes" ("school_id", "academic_year_id", "code") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."student_classes_status_enum" AS ENUM('ACTIVE', 'LEFT')`,
    );
    await queryRunner.query(
      `CREATE TABLE "student_classes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "student_id" uuid NOT NULL, "class_id" uuid NOT NULL, "academic_year_id" uuid NOT NULL, "joined_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "left_at" TIMESTAMP WITH TIME ZONE, "status" "public"."student_classes_status_enum" NOT NULL DEFAULT 'ACTIVE', CONSTRAINT "PK_e6fcc2e4f8f79a5aa16a50c8f46" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_student_classes_student_id_academic_year_id" ON "student_classes" ("student_id", "academic_year_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."semesters_status_enum" AS ENUM('DRAFT', 'ACTIVE', 'CLOSED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "semesters" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "academic_year_id" uuid NOT NULL, "name" character varying(100) NOT NULL, "code" character varying(20) NOT NULL, "start_date" date NOT NULL, "end_date" date NOT NULL, "status" "public"."semesters_status_enum" NOT NULL DEFAULT 'DRAFT', CONSTRAINT "PK_25c393e2e76b3e32e87a79b1dc2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_semesters_academic_year_id_code" ON "semesters" ("academic_year_id", "code") `,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid, "action" character varying(100) NOT NULL, "entity_type" character varying(100) NOT NULL, "entity_id" character varying(100), "old_data" jsonb, "new_data" jsonb, "ip_address" character varying(64), "user_agent" character varying(255), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_entity_type" ON "audit_logs" ("entity_type") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_entity_id" ON "audit_logs" ("entity_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "students" ADD CONSTRAINT "FK_aa8edc7905ad764f85924569647" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_years" ADD CONSTRAINT "FK_b293eb7909d2a3aae86c4380713" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "classes" ADD CONSTRAINT "FK_398f3990f5da4a1efda173f576f" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "classes" ADD CONSTRAINT "FK_28b990f2f869e1d1652a15388f5" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_classes" ADD CONSTRAINT "FK_09b94eccbdedd86b77d54daaeb8" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_classes" ADD CONSTRAINT "FK_250de2754beaff18091a60a6654" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_classes" ADD CONSTRAINT "FK_544ca1c9972bb7b09d54ad11c46" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "semesters" ADD CONSTRAINT "FK_a2d5014975f0e10189e2dc45820" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "semesters" DROP CONSTRAINT "FK_a2d5014975f0e10189e2dc45820"`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_classes" DROP CONSTRAINT "FK_544ca1c9972bb7b09d54ad11c46"`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_classes" DROP CONSTRAINT "FK_250de2754beaff18091a60a6654"`,
    );
    await queryRunner.query(
      `ALTER TABLE "student_classes" DROP CONSTRAINT "FK_09b94eccbdedd86b77d54daaeb8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "classes" DROP CONSTRAINT "FK_28b990f2f869e1d1652a15388f5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "classes" DROP CONSTRAINT "FK_398f3990f5da4a1efda173f576f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "academic_years" DROP CONSTRAINT "FK_b293eb7909d2a3aae86c4380713"`,
    );
    await queryRunner.query(
      `ALTER TABLE "students" DROP CONSTRAINT "FK_aa8edc7905ad764f85924569647"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_audit_logs_entity_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_audit_logs_entity_type"`);
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_semesters_academic_year_id_code"`,
    );
    await queryRunner.query(`DROP TABLE "semesters"`);
    await queryRunner.query(`DROP TYPE "public"."semesters_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_student_classes_student_id_academic_year_id"`,
    );
    await queryRunner.query(`DROP TABLE "student_classes"`);
    await queryRunner.query(`DROP TYPE "public"."student_classes_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_classes_school_id_academic_year_id_code"`,
    );
    await queryRunner.query(`DROP TABLE "classes"`);
    await queryRunner.query(`DROP TYPE "public"."classes_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_academic_years_school_id_name"`,
    );
    await queryRunner.query(`DROP TABLE "academic_years"`);
    await queryRunner.query(`DROP TYPE "public"."academic_years_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_students_school_id_student_code"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_students_identifier_code"`,
    );
    await queryRunner.query(`DROP TABLE "students"`);
    await queryRunner.query(`DROP TYPE "public"."students_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."students_gender_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_schools_code"`);
    await queryRunner.query(`DROP TABLE "schools"`);
    await queryRunner.query(`DROP TYPE "public"."schools_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_users_email"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    await queryRunner.query(`DROP TABLE "number_sequences"`);
  }
}
