import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase9SchoolContacts1789003343942 implements MigrationInterface {
  name = 'Phase9SchoolContacts1789003343942';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "schools" ADD "manager_info" character varying(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "schools" ADD "sales_representative" character varying(255) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "schools" DROP COLUMN "sales_representative"`,
    );
    await queryRunner.query(`ALTER TABLE "schools" DROP COLUMN "manager_info"`);
  }
}
