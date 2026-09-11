import { QueryFailedError, Repository, SelectQueryBuilder } from 'typeorm';
import { EntityStatus } from '../common/enums/status.enum';
import { ErrorCode } from '../common/constants/error-codes';
import { SequenceService } from '../database/sequence.service';
import { CreateSchoolDto } from './dto/create-school.dto';
import { School } from './entities/school.entity';
import { SchoolsService } from './schools.service';

describe('SchoolsService', () => {
  let repository: jest.Mocked<Repository<School>>;
  let sequenceService: jest.Mocked<SequenceService>;
  let generateCode: jest.MockedFunction<SequenceService['generateCode']>;
  let service: SchoolsService;
  let schoolId = 0;

  const persistedSchool = (input: Partial<School>): School => {
    schoolId += 1;
    return {
      id: `00000000-0000-4000-8000-${String(schoolId).padStart(12, '0')}`,
      createdAt: new Date('2026-09-10T00:00:00.000Z'),
      updatedAt: new Date('2026-09-10T00:00:00.000Z'),
      companyId: null,
      company: null,
      code: '',
      name: '',
      address: null,
      phone: null,
      taxCode: null,
      managerInfo: null,
      salesRepresentative: null,
      bankName: null,
      bankCode: null,
      bankAccountNumber: null,
      bankAccountName: null,
      status: EntityStatus.ACTIVE,
      deletedAt: null,
      ...input,
    };
  };

  beforeEach(() => {
    schoolId = 0;
    repository = {
      create: jest.fn((input: Partial<School>) => input as School),
      save: jest.fn((input: School) => Promise.resolve(persistedSchool(input))),
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<School>>;
    generateCode = jest.fn();
    sequenceService = {
      generateCode,
    } as unknown as jest.Mocked<SequenceService>;
    service = new SchoolsService(repository, sequenceService);
  });

  it('creates a school without a client-supplied code', async () => {
    generateCode.mockResolvedValue('SCH000001');

    const school = await service.create({ name: 'School A' });

    expect(school.code).toBe('SCH000001');
    expect(school.code).toMatch(/^SCH\d{6}$/);
    expect(generateCode).toHaveBeenCalledWith('SCH', 'SCHOOL', 6);
  });

  it('preserves a unique school code supplied by a legacy client', async () => {
    repository.findOne.mockResolvedValue(null);

    const school = await service.create({
      code: 'LEGACY-001',
      name: 'Legacy School',
    });

    expect(school.code).toBe('LEGACY-001');
    expect(generateCode).not.toHaveBeenCalled();
  });

  it('generates different correctly formatted codes for schools with the same name', async () => {
    let sequence = 0;
    generateCode.mockImplementation(() => {
      sequence += 1;
      return Promise.resolve(`SCH${String(sequence).padStart(6, '0')}`);
    });

    const [first, second] = await Promise.all([
      service.create({ name: 'Same School' }),
      service.create({ name: 'Same School' }),
    ]);

    expect(first.name).toBe(second.name);
    expect(first.code).toMatch(/^SCH\d{6}$/);
    expect(second.code).toMatch(/^SCH\d{6}$/);
    expect(first.code).not.toBe(second.code);
  });

  it('retries when a generated code collides with a legacy code', async () => {
    generateCode
      .mockResolvedValueOnce('SCH000001')
      .mockResolvedValueOnce('SCH000002');
    repository.save
      .mockRejectedValueOnce(
        new QueryFailedError('INSERT INTO schools', [], {
          code: '23505',
        } as never),
      )
      .mockImplementationOnce((input) =>
        Promise.resolve(persistedSchool(input)),
      );

    const school = await service.create({ name: 'School A' });

    expect(school.code).toBe('SCH000002');
    expect(generateCode).toHaveBeenCalledTimes(2);
  });

  it('keeps accepting legacy codes and reports SCHOOL_CODE_EXISTS for duplicates', async () => {
    repository.findOne.mockResolvedValue(persistedSchool({ code: 'LEGACY' }));

    await expect(
      service.create({ code: 'LEGACY', name: 'School A' }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.SCHOOL_CODE_EXISTS });
    expect(generateCode).not.toHaveBeenCalled();
  });

  it('maps a database race on a client-supplied code to SCHOOL_CODE_EXISTS', async () => {
    repository.findOne.mockResolvedValue(null);
    repository.save.mockRejectedValue(
      new QueryFailedError('INSERT INTO schools', [], {
        code: '23505',
      } as never),
    );

    await expect(
      service.create({ code: 'LEGACY', name: 'School A' }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.SCHOOL_CODE_EXISTS });
  });

  it('creates and updates manager and sales representative information', async () => {
    generateCode.mockResolvedValue('SCH000001');
    const dto: CreateSchoolDto = {
      name: 'School A',
      managerInfo: 'Principal A - 0901234567',
      salesRepresentative: 'Sales B',
    };

    const created = await service.create(dto);
    expect(created).toMatchObject({
      managerInfo: dto.managerInfo,
      salesRepresentative: dto.salesRepresentative,
    });

    repository.findOne.mockResolvedValue(created);
    const updated = await service.update(created.id, {
      managerInfo: 'Principal C - 0907654321',
      salesRepresentative: 'Sales D',
    });

    expect(updated).toMatchObject({
      managerInfo: 'Principal C - 0907654321',
      salesRepresentative: 'Sales D',
    });
  });

  it('reads legacy rows with null manager and sales information in detail and list results', async () => {
    const legacySchool = persistedSchool({
      code: 'LEGACY',
      name: 'Legacy School',
      managerInfo: null,
      salesRepresentative: null,
    });
    repository.findOne.mockResolvedValue(legacySchool);

    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[legacySchool], 1]),
    } as unknown as jest.Mocked<SelectQueryBuilder<School>>;
    repository.createQueryBuilder.mockReturnValue(queryBuilder);

    await expect(service.findById(legacySchool.id)).resolves.toMatchObject({
      managerInfo: null,
      salesRepresentative: null,
    });
    const result = await service.findAll({ page: 1, limit: 20, skip: 0 });
    expect(result.data[0]).toMatchObject({
      managerInfo: null,
      salesRepresentative: null,
    });
  });
});
