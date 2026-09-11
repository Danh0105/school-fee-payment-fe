import { MigrationInterface, QueryRunner } from 'typeorm';

export class DefaultSemesters1789005000000 implements MigrationInterface {
  name = 'DefaultSemesters1789005000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "semesters" (
        "id",
        "created_at",
        "updated_at",
        "academic_year_id",
        "name",
        "code",
        "start_date",
        "end_date",
        "status"
      )
      SELECT
        uuid_generate_v5(
          '00000000-0000-0000-0000-000000000000'::uuid,
          academic_year."id"::text || ':HK1'
        ),
        now(),
        now(),
        academic_year."id",
        'Học kỳ 1',
        'HK1',
        academic_year."start_date",
        academic_year."start_date" + GREATEST(
          ((academic_year."end_date" - academic_year."start_date" + 1) / 2) - 1,
          0
        ),
        academic_year."status"::text::"semesters_status_enum"
      FROM "academic_years" academic_year
      ON CONFLICT ("academic_year_id", "code") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "semesters" (
        "id",
        "created_at",
        "updated_at",
        "academic_year_id",
        "name",
        "code",
        "start_date",
        "end_date",
        "status"
      )
      SELECT
        uuid_generate_v5(
          '00000000-0000-0000-0000-000000000000'::uuid,
          academic_year."id"::text || ':HK2'
        ),
        now(),
        now(),
        academic_year."id",
        'Học kỳ 2',
        'HK2',
        academic_year."start_date" + GREATEST(
          (academic_year."end_date" - academic_year."start_date" + 1) / 2,
          0
        ),
        academic_year."end_date",
        academic_year."status"::text::"semesters_status_enum"
      FROM "academic_years" academic_year
      ON CONFLICT ("academic_year_id", "code") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "semesters" semester
      USING "academic_years" academic_year
      WHERE semester."academic_year_id" = academic_year."id"
        AND (
          semester."id" = uuid_generate_v5(
            '00000000-0000-0000-0000-000000000000'::uuid,
            academic_year."id"::text || ':HK1'
          )
          OR semester."id" = uuid_generate_v5(
            '00000000-0000-0000-0000-000000000000'::uuid,
            academic_year."id"::text || ':HK2'
          )
        )
    `);
  }
}
