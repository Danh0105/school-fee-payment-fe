import { MigrationInterface, QueryRunner } from 'typeorm';

export class ImportBootstrapContext1791782000000 implements MigrationInterface {
  name = 'ImportBootstrapContext1791782000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "import_sessions" ADD "bootstrap_context" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "import_sessions" DROP COLUMN "bootstrap_context"`,
    );
  }
}
