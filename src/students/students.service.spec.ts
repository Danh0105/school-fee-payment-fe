import { Repository } from 'typeorm';
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
});
