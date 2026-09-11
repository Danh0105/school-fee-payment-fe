import { MigrationInterface, QueryRunner } from 'typeorm';

export class SystemAcademicYears1789006000000 implements MigrationInterface {
  name = 'SystemAcademicYears1789006000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH current_period AS (
        SELECT
          CASE
            WHEN EXTRACT(
              MONTH FROM CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh'
            ) >= 9
              THEN EXTRACT(
                YEAR FROM CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh'
              )::integer
            ELSE EXTRACT(
              YEAR FROM CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh'
            )::integer - 1
          END AS start_year
      )
      INSERT INTO "academic_years" (
        "id",
        "created_at",
        "updated_at",
        "school_id",
        "name",
        "start_date",
        "end_date",
        "status"
      )
      SELECT
        uuid_generate_v5(
          '00000000-0000-0000-0000-000000000000'::uuid,
          school."id"::text || ':ACADEMIC_YEAR:' || period.start_year::text
        ),
        now(),
        now(),
        school."id",
        period.start_year::text || '-' || (period.start_year + 1)::text,
        make_date(period.start_year, 9, 1),
        make_date(period.start_year + 1, 8, 31),
        'ACTIVE'::"academic_years_status_enum"
      FROM "schools" school
      CROSS JOIN current_period period
      WHERE school."deleted_at" IS NULL
      ON CONFLICT ("school_id", "name") DO NOTHING
    `);

    await this.insertSemester(queryRunner, 'HK1', 'Học kỳ 1');
    await this.insertSemester(queryRunner, 'HK2', 'Học kỳ 2');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "academic_years" academic_year
      WHERE academic_year."id" = uuid_generate_v5(
        '00000000-0000-0000-0000-000000000000'::uuid,
        academic_year."school_id"::text
          || ':ACADEMIC_YEAR:'
          || split_part(academic_year."name", '-', 1)
      )
    `);
  }

  private async insertSemester(
    queryRunner: QueryRunner,
    code: 'HK1' | 'HK2',
    name: string,
  ): Promise<void> {
    const isFirstSemester = code === 'HK1';
    const startDate = isFirstSemester
      ? 'academic_year."start_date"'
      : `academic_year."start_date" + GREATEST(
          (academic_year."end_date" - academic_year."start_date" + 1) / 2,
          0
        )`;
    const endDate = isFirstSemester
      ? `academic_year."start_date" + GREATEST(
          ((academic_year."end_date" - academic_year."start_date" + 1) / 2) - 1,
          0
        )`
      : 'academic_year."end_date"';

    await queryRunner.query(`
      WITH current_period AS (
        SELECT
          CASE
            WHEN EXTRACT(
              MONTH FROM CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh'
            ) >= 9
              THEN EXTRACT(
                YEAR FROM CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh'
              )::integer
            ELSE EXTRACT(
              YEAR FROM CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh'
            )::integer - 1
          END AS start_year
      )
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
          academic_year."id"::text || ':${code}'
        ),
        now(),
        now(),
        academic_year."id",
        '${name}',
        '${code}',
        ${startDate},
        ${endDate},
        academic_year."status"::text::"semesters_status_enum"
      FROM "academic_years" academic_year
      INNER JOIN "schools" school ON school."id" = academic_year."school_id"
      CROSS JOIN current_period period
      WHERE academic_year."id" = uuid_generate_v5(
        '00000000-0000-0000-0000-000000000000'::uuid,
        school."id"::text || ':ACADEMIC_YEAR:' || period.start_year::text
      )
      ON CONFLICT ("academic_year_id", "code") DO NOTHING
    `);
  }
}
