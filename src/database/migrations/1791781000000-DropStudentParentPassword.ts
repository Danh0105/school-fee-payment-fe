import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropStudentParentPassword1791781000000 implements MigrationInterface {
  name = 'DropStudentParentPassword1791781000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "students" DROP COLUMN "parent_password_hash"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "students" ADD "parent_password_hash" character varying(255)`,
    );
  }
}
