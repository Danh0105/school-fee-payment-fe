import {
  DataSource,
  EntityManager,
  InsertResult,
  Repository,
  UpdateResult,
} from 'typeorm';
import { AcademicYearStatus } from '../common/enums/status.enum';
import { SemestersService } from '../semesters/semesters.service';
import { AcademicYear } from './entities/academic-year.entity';
import { AcademicYearsService } from './academic-years.service';

describe('AcademicYearsService current academic year', () => {
  it.each([
    ['2026-09-10T00:00:00.000Z', '2026-2027', '2026-09-01', '2027-08-31'],
    ['2026-08-31T00:00:00.000Z', '2025-2026', '2025-09-01', '2026-08-31'],
  ])(
    'resolves the current period at %s',
    async (now, expectedName, expectedStartDate, expectedEndDate) => {
      let upsertValue: Partial<AcademicYear> = {};
      const update = jest.fn(() => Promise.resolve({} as UpdateResult));
      const upsert = jest.fn((value: Partial<AcademicYear>) => {
        upsertValue = value;
        return Promise.resolve({} as InsertResult);
      });
      const academicYear = {
        id: '00000000-0000-4000-8000-000000000001',
        schoolId: '00000000-0000-4000-8000-000000000002',
        name: expectedName,
        startDate: expectedStartDate,
        endDate: expectedEndDate,
        status: AcademicYearStatus.ACTIVE,
      } as AcademicYear;
      const findOne = jest.fn(() => Promise.resolve(academicYear));
      const transactionRepository = {
        update,
        upsert,
        findOne,
      } as unknown as Repository<AcademicYear>;
      const manager = {
        getRepository: jest.fn(() => transactionRepository),
      } as unknown as EntityManager;
      const transaction = jest.fn(
        (work: (entityManager: EntityManager) => Promise<AcademicYear>) =>
          work(manager),
      );
      const synchronizeDefaults = jest.fn(() => Promise.resolve());
      const service = new AcademicYearsService(
        {} as Repository<AcademicYear>,
        { transaction } as unknown as DataSource,
        { synchronizeDefaults } as unknown as SemestersService,
      );

      const result = await service.getCurrent(
        academicYear.schoolId,
        new Date(now),
      );

      expect(upsertValue).toMatchObject({
        schoolId: academicYear.schoolId,
        name: expectedName,
        startDate: expectedStartDate,
        endDate: expectedEndDate,
        status: AcademicYearStatus.ACTIVE,
      });
      expect(result).toBe(academicYear);
      expect(synchronizeDefaults).toHaveBeenCalledWith(academicYear, manager);
    },
  );
});
