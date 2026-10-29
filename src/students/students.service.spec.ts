import { EntityManager, Repository } from 'typeorm';
import { SequenceService } from '../database/sequence.service';
import { School } from '../schools/entities/school.entity';
import { SchoolsService } from '../schools/schools.service';
import { Student } from './entities/student.entity';
import { StudentsService } from './students.service';

describe('StudentsService generated code', () => {
  it('generates different student codes without client input', async () => {
    const schoolId = '00000000-0000-4000-8000-000000000001';
    const school = { id: schoolId, code: 'SCH000001' } as School;
    const findOne = jest.fn(() => Promise.resolve(null));
    const create = jest.fn((value: Partial<Student>) => value as Student);
    const save = jest.fn((value: Student) => Promise.resolve(value));
    const findSchool = jest.fn(() => Promise.resolve(school));
    let sequence = 0;
    const next = jest.fn(() => {
      sequence += 1;
      return Promise.resolve(sequence);
    });
    const service = new StudentsService(
      { findOne, create, save } as unknown as Repository<Student>,
      { findById: findSchool } as unknown as SchoolsService,
      { next } as unknown as SequenceService,
    );

    const [first, second] = await Promise.all([
      service.create({ schoolId, fullName: 'Học sinh A' }),
      service.create({ schoolId, fullName: 'Học sinh B' }),
    ]);

    expect(first.studentCode).toBe('SCH000001000000001');
    expect(second.studentCode).toBe('SCH000001000000002');
    expect(first.studentCode).not.toBe(second.studentCode);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('matches parent accounts by phone suffix and student birth date', async () => {
    const getMany = jest.fn(() => Promise.resolve([]));
    const queryBuilder = {
      where: jest.fn(),
      andWhere: jest.fn(),
      take: jest.fn(),
      getMany,
    };
    for (const method of ['where', 'andWhere', 'take'] as const) {
      queryBuilder[method].mockReturnValue(queryBuilder);
    }
    const createQueryBuilder = jest.fn(() => queryBuilder);
    const service = new StudentsService(
      { createQueryBuilder } as unknown as Repository<Student>,
      {} as SchoolsService,
      {} as SequenceService,
    );

    await service.findByParentCredentials('+84 901 234 567', '2015-08-15');

    expect(createQueryBuilder).toHaveBeenCalledWith('student');
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'student.dateOfBirth = :dateOfBirth',
      { dateOfBirth: '2015-08-15' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('RIGHT(regexp_replace'),
      { phoneSuffix: '901234567' },
    );
    expect(queryBuilder.take).toHaveBeenCalledWith(2);
    expect(getMany).toHaveBeenCalled();
  });

  it('reads a newly created school through the supplied transaction manager', async () => {
    const schoolId = '00000000-0000-4000-8000-000000000001';
    const schoolRepository = {
      findOne: jest.fn(() =>
        Promise.resolve({ id: schoolId, code: 'NEW-SCHOOL' } as School),
      ),
    };
    const studentRepository = {
      findOne: jest.fn(() => Promise.resolve(null)),
      create: jest.fn((value: Partial<Student>) => value as Student),
      save: jest.fn((value: Student) => Promise.resolve(value)),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === School ? schoolRepository : studentRepository,
      ),
    } as unknown as EntityManager;
    const findSchoolOutsideTransaction = jest.fn();
    const service = new StudentsService(
      {} as Repository<Student>,
      {
        findById: findSchoolOutsideTransaction,
      } as unknown as SchoolsService,
      {} as SequenceService,
    );

    const student = await service.create(
      {
        schoolId,
        studentCode: 'HS001',
        fullName: 'Học sinh A',
      },
      manager,
    );

    expect(student.studentCode).toBe('HS001');
    expect(schoolRepository.findOne).toHaveBeenCalled();
    expect(findSchoolOutsideTransaction).not.toHaveBeenCalled();
  });
});
