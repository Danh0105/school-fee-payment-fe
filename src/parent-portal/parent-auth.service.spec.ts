import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHmac } from 'node:crypto';
import { ErrorCode } from '../common/constants/error-codes';
import { AppException } from '../common/exceptions/app.exception';
import { Student } from '../students/entities/student.entity';
import { StudentsService } from '../students/students.service';
import { ParentAuthService } from './parent-auth.service';

describe('ParentAuthService name lookup', () => {
  const schoolId = '00000000-0000-4000-8000-000000000001';
  const student = {
    id: '00000000-0000-4000-8000-000000000002',
    schoolId,
    studentCode: 'SCH000001000000001',
    identifierCode: '012345678901',
    fullName: 'Nguyễn Văn An',
    dateOfBirth: '2012-03-04',
    phone: null,
    parentPhone: '0912 345 678',
  } as Student;

  const configValues: Record<string, string> = {
    'parentJwt.secret': 'parent-access-secret',
    'parentJwt.expiresIn': '30d',
    'parentLookupJwt.secret': 'parent-lookup-secret',
    'parentLookupJwt.expiresIn': '10m',
  };

  function setup() {
    const studentsService = {
      searchByFullName: jest.fn(),
      findByIdentifierCode: jest.fn(),
    };
    const jwtService = {
      signAsync: jest.fn((payload: Record<string, unknown>) =>
        Promise.resolve(
          payload.purpose === 'parent-student-lookup'
            ? 'signed-lookup-token'
            : 'signed-access-token',
        ),
      ),
      verifyAsync: jest.fn(),
    };
    const config = {
      get: jest.fn((key: string) => configValues[key]),
    };
    const service = new ParentAuthService(
      studentsService as unknown as StudentsService,
      jwtService as unknown as JwtService,
      config as unknown as ConfigService,
    );

    return { service, studentsService, jwtService };
  }

  function lookupPayload(candidate: Student) {
    return {
      purpose: 'parent-student-lookup',
      candidateProof: createHmac(
        'sha256',
        configValues['parentLookupJwt.secret'],
      )
        .update(`${candidate.schoolId}:${candidate.id}`)
        .digest('base64url'),
      schoolId: candidate.schoolId,
    };
  }

  it('returns only masked hints and a short-lived lookup token', async () => {
    const { service, studentsService, jwtService } = setup();
    studentsService.searchByFullName.mockResolvedValue([student]);

    const result = await service.searchByFullName({
      schoolId,
      fullName: '  Nguyễn   Văn An  ',
    });

    expect(studentsService.searchByFullName).toHaveBeenCalledWith(
      'Nguyễn Văn An',
      schoolId,
    );
    expect(result).toEqual([
      {
        lookupToken: 'signed-lookup-token',
        displayName: 'N***** V** A*',
        dateOfBirthHint: '**/**/2012',
        parentPhoneHint: '*******678',
      },
    ]);
    expect(result[0]).not.toHaveProperty('id');
    expect(result[0]).not.toHaveProperty('studentCode');
    expect(result[0]).not.toHaveProperty('identifierCode');
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'parent-student-lookup',
        schoolId,
      }),
      { secret: 'parent-lookup-secret', expiresIn: '10m' },
    );
    const signedPayload = jwtService.signAsync.mock.calls[0][0];
    expect(signedPayload).not.toHaveProperty('candidateId');
    expect(signedPayload.candidateProof).toEqual(expect.any(String));
  });

  it('returns no results without querying students for fewer than three characters', async () => {
    const { service, studentsService } = setup();

    await expect(
      service.searchByFullName({ schoolId, query: 'An' }),
    ).resolves.toEqual([]);
    expect(studentsService.searchByFullName).not.toHaveBeenCalled();
  });

  it('issues a real parent token only after the identifier matches the candidate', async () => {
    const { service, studentsService, jwtService } = setup();
    jwtService.verifyAsync.mockResolvedValue(lookupPayload(student));
    studentsService.findByIdentifierCode.mockResolvedValue([student]);

    const result = await service.verifyLookup({
      lookupToken: 'signed-lookup-token',
      identifierCode: ` ${student.identifierCode} `,
    });

    expect(studentsService.findByIdentifierCode).toHaveBeenCalledWith(
      student.identifierCode,
      schoolId,
    );
    expect(result).toEqual({
      accessToken: 'signed-access-token',
      student,
    });
    expect(jwtService.signAsync).toHaveBeenLastCalledWith(
      { studentId: student.id },
      { secret: 'parent-access-secret', expiresIn: '30d' },
    );
  });

  it('does not issue access when the identifier belongs to another student', async () => {
    const { service, studentsService, jwtService } = setup();
    jwtService.verifyAsync.mockResolvedValue(lookupPayload(student));
    studentsService.findByIdentifierCode.mockResolvedValue([
      { ...student, id: '00000000-0000-4000-8000-000000000099' },
    ]);

    await expect(
      service.verifyLookup({
        lookupToken: 'signed-lookup-token',
        identifierCode: 'another-identifier',
      }),
    ).rejects.toMatchObject<AppException>({
      errorCode: ErrorCode.PARENT_VERIFICATION_FAILED,
    });
  });

  it('maps invalid or expired lookup tokens to the generic verification error', async () => {
    const { service, jwtService } = setup();
    jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));

    await expect(
      service.verifyLookup({
        lookupToken: 'expired-token',
        identifierCode: student.identifierCode!,
      }),
    ).rejects.toMatchObject<AppException>({
      errorCode: ErrorCode.PARENT_VERIFICATION_FAILED,
    });
  });
});
