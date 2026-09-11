import { Repository } from 'typeorm';
import { AcademicYearsService } from '../academic-years/academic-years.service';
import { AcademicYear } from '../academic-years/entities/academic-year.entity';
import { SequenceService } from '../database/sequence.service';
import { Class } from './entities/class.entity';
import { ClassesService } from './classes.service';

describe('ClassesService generated code', () => {
  it('uses the current academic year and generates a class code', async () => {
    const schoolId = '00000000-0000-4000-8000-000000000001';
    const academicYear = {
      id: '00000000-0000-4000-8000-000000000002',
      schoolId,
    } as AcademicYear;
    const create = jest.fn((value: Partial<Class>) => value as Class);
    const save = jest.fn((value: Class) =>
      Promise.resolve({
        id: '00000000-0000-4000-8000-000000000003',
        ...value,
      }),
    );
    const getCurrent = jest.fn(() => Promise.resolve(academicYear));
    const generateCode = jest.fn(() => Promise.resolve('CLS000001'));
    const service = new ClassesService(
      { create, save } as unknown as Repository<Class>,
      { getCurrent } as unknown as AcademicYearsService,
      { generateCode } as unknown as SequenceService,
    );

    const result = await service.create({
      schoolId,
      name: 'Lớp 1A1',
      grade: '1',
    });

    expect(getCurrent).toHaveBeenCalledWith(schoolId);
    expect(generateCode).toHaveBeenCalledWith(
      'CLS',
      `CLASS:${schoolId}:${academicYear.id}`,
      6,
    );
    expect(result).toMatchObject({
      schoolId,
      academicYearId: academicYear.id,
      code: 'CLS000001',
      name: 'Lớp 1A1',
    });
  });
});
