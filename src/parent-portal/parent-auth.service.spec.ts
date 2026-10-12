import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode } from '../common/constants/error-codes';
import { AppException } from '../common/exceptions/app.exception';
import { Student } from '../students/entities/student.entity';
import { StudentsService } from '../students/students.service';
import { ParentAuthService } from './parent-auth.service';

describe('ParentAuthService phone login', () => {
  const schoolId = '00000000-0000-4000-8000-000000000001';
  const student = {
    id: '00000000-0000-4000-8000-000000000002',
    schoolId,
    studentCode: 'SCH000001000000001',
    fullName: 'Học sinh thật',
    dateOfBirth: '2015-08-15',
    parentPhone: '0901 234 567',
  } as Student;

  function setup() {
    const studentsService = {
      findByParentCredentials: jest.fn(),
    };
    const jwtService = {
      signAsync: jest.fn(() => Promise.resolve('signed-access-token')),
    };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'parentJwt.secret') return 'parent-access-secret';
        if (key === 'parentJwt.expiresIn') return '30d';
        return undefined;
      }),
    };
    const service = new ParentAuthService(
      studentsService as unknown as StudentsService,
      jwtService as unknown as JwtService,
      config as unknown as ConfigService,
    );
    return { service, studentsService, jwtService };
  }

  it('uses the parent phone and DDMMYYYY birth date to issue access', async () => {
    const { service, studentsService, jwtService } = setup();
    studentsService.findByParentCredentials.mockResolvedValue([student]);

    await expect(
      service.login({
        schoolId,
        username: '+84 901 234 567',
        password: '15082015',
      }),
    ).resolves.toEqual({
      accessToken: 'signed-access-token',
      student,
    });

    expect(studentsService.findByParentCredentials).toHaveBeenCalledWith(
      schoolId,
      '84901234567',
      '2015-08-15',
    );
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      { studentId: student.id, authVersion: 3 },
      { secret: 'parent-access-secret', expiresIn: '30d' },
    );
  });

  it('rejects an invalid calendar date without querying students', async () => {
    const { service, studentsService } = setup();

    await expect(
      service.login({
        schoolId,
        username: '0901234567',
        password: '31022015',
      }),
    ).rejects.toMatchObject<AppException>({
      errorCode: ErrorCode.PARENT_VERIFICATION_FAILED,
    });
    expect(studentsService.findByParentCredentials).not.toHaveBeenCalled();
  });

  it('rejects ambiguous credentials instead of selecting a student', async () => {
    const { service, studentsService } = setup();
    studentsService.findByParentCredentials.mockResolvedValue([
      student,
      { ...student, id: '00000000-0000-4000-8000-000000000003' },
    ]);

    await expect(
      service.login({
        schoolId,
        username: '0901234567',
        password: '15082015',
      }),
    ).rejects.toMatchObject<AppException>({
      errorCode: ErrorCode.PARENT_VERIFICATION_FAILED,
    });
  });

  it('locks the account key after five failed attempts', async () => {
    const { service, studentsService } = setup();
    studentsService.findByParentCredentials.mockResolvedValue([]);
    const dto = {
      schoolId,
      username: '0901234567',
      password: '15082015',
    };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(service.login(dto)).rejects.toMatchObject<AppException>({
        errorCode: ErrorCode.PARENT_VERIFICATION_FAILED,
      });
    }
    await expect(service.login(dto)).rejects.toMatchObject<AppException>({
      errorCode: ErrorCode.PARENT_VERIFICATION_FAILED,
    });
    expect(studentsService.findByParentCredentials).toHaveBeenCalledTimes(5);
  });
});
