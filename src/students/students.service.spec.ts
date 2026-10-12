import { Repository } from 'typeorm';
import { SequenceService } from '../database/sequence.service';
import { School } from '../schools/entities/school.entity';
import { SchoolsService } from '../schools/schools.service';
import { Student } from './entities/student.entity';
import { StudentsService } from './students.service';
import * as bcrypt from 'bcrypt';

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

  it('uses a normalized partial name for the public parent lookup', async () => {
    const schoolId = '00000000-0000-4000-8000-000000000001';
    const getMany = jest.fn(() => Promise.resolve([]));
    const queryBuilder = {
      where: jest.fn(),
      andWhere: jest.fn(),
      orderBy: jest.fn(),
      take: jest.fn(),
      getMany,
    };
    for (const method of ['where', 'andWhere', 'orderBy', 'take'] as const) {
      queryBuilder[method].mockReturnValue(queryBuilder);
    }
    const createQueryBuilder = jest.fn(() => queryBuilder);
    const service = new StudentsService(
      { createQueryBuilder } as unknown as Repository<Student>,
      {} as SchoolsService,
      {} as SequenceService,
    );

    await service.searchByFullName('  Nguyễn   Văn An  ', schoolId);

    expect(createQueryBuilder).toHaveBeenCalledWith('student');
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('POSITION(LOWER(:fullName)'),
      { fullName: 'Nguyễn Văn An' },
    );
    expect(queryBuilder.take).toHaveBeenCalledWith(20);
    expect(getMany).toHaveBeenCalled();
  });

  it('hashes the parent password and never returns the hash', async () => {
    const schoolId = '00000000-0000-4000-8000-000000000001';
    const school = { id: schoolId, code: 'SCH000001' } as School;
    let persisted: Student | undefined;
    const repo = {
      findOne: jest.fn(() => Promise.resolve(null)),
      create: jest.fn((value: Partial<Student>) => value as Student),
      save: jest.fn((value: Student) => {
        persisted = { ...value };
        return Promise.resolve(value);
      }),
    };
    const service = new StudentsService(
      repo as unknown as Repository<Student>,
      {
        findById: jest.fn(() => Promise.resolve(school)),
      } as unknown as SchoolsService,
      { next: jest.fn(() => Promise.resolve(1)) } as unknown as SequenceService,
    );

    const result = await service.create({
      schoolId,
      fullName: 'Học sinh A',
      parentPassword: 'Parent@123',
    });

    expect(persisted?.parentPasswordHash).toMatch(/^\$2[aby]\$/);
    await expect(
      bcrypt.compare('Parent@123', persisted!.parentPasswordHash!),
    ).resolves.toBe(true);
    expect(persisted).not.toHaveProperty('parentPassword');
    expect(result).not.toHaveProperty('parentPasswordHash');
    expect(result).not.toHaveProperty('parentPassword');
  });
});
