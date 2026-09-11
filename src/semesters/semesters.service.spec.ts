import { InsertResult, Repository } from 'typeorm';
import {
  AcademicYearStatus,
  SemesterStatus,
} from '../common/enums/status.enum';
import { AcademicYear } from '../academic-years/entities/academic-year.entity';
import { Semester } from './entities/semester.entity';
import { SemestersService } from './semesters.service';

describe('SemestersService', () => {
  it('creates the two system semesters for an academic year', async () => {
    let semesters: Array<Partial<Semester>> = [];
    let conflictPaths: string[] = [];
    const upsert = jest.fn(
      (values: Array<Partial<Semester>>, paths: string[]) => {
        semesters = values;
        conflictPaths = paths;
        return Promise.resolve({} as InsertResult);
      },
    );
    const repository = { upsert } as unknown as Repository<Semester>;
    const service = new SemestersService(repository);
    const academicYear = {
      id: '00000000-0000-4000-8000-000000000001',
      schoolId: '00000000-0000-4000-8000-000000000002',
      name: '2026-2027',
      startDate: '2026-09-01',
      endDate: '2027-05-31',
      status: AcademicYearStatus.ACTIVE,
    } as AcademicYear;

    await service.synchronizeDefaults(academicYear);

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(semesters).toEqual([
      expect.objectContaining({
        academicYearId: academicYear.id,
        code: 'HK1',
        name: 'Học kỳ 1',
        startDate: '2026-09-01',
        endDate: '2027-01-14',
        status: SemesterStatus.ACTIVE,
      }),
      expect.objectContaining({
        academicYearId: academicYear.id,
        code: 'HK2',
        name: 'Học kỳ 2',
        startDate: '2027-01-15',
        endDate: '2027-05-31',
        status: SemesterStatus.ACTIVE,
      }),
    ]);
    expect(conflictPaths).toEqual(['academicYearId', 'code']);
  });

  it.each([
    [AcademicYearStatus.DRAFT, SemesterStatus.DRAFT],
    [AcademicYearStatus.CLOSED, SemesterStatus.CLOSED],
  ])(
    'synchronizes semester status from academic year status %s',
    async (yearStatus, semesterStatus) => {
      let semesters: Array<Partial<Semester>> = [];
      const upsert = jest.fn((values: Array<Partial<Semester>>) => {
        semesters = values;
        return Promise.resolve({} as InsertResult);
      });
      const service = new SemestersService({
        upsert,
      } as unknown as Repository<Semester>);
      const academicYear = {
        id: '00000000-0000-4000-8000-000000000001',
        startDate: '2026-09-01',
        endDate: '2027-05-31',
        status: yearStatus,
      } as AcademicYear;

      await service.synchronizeDefaults(academicYear);

      expect(semesters).toHaveLength(2);
      expect(
        semesters.every((semester) => semester.status === semesterStatus),
      ).toBe(true);
    },
  );
});
