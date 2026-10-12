import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { StudentsService } from '../students/students.service';
import { ParentJwtPayload } from './interfaces/parent-jwt-payload.interface';
import { Student } from '../students/entities/student.entity';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { SearchStudentByNameDto } from './dto/search-student-by-name.dto';
import { VerifyStudentAccessDto } from './dto/verify-student-access.dto';
import { ParentLookupJwtPayload } from './interfaces/parent-lookup-jwt-payload.interface';

export interface ParentAccessResult {
  accessToken: string;
  student: Student;
}

export interface ParentStudentLookupResult {
  lookupToken: string;
  displayName: string;
  dateOfBirthHint: string | null;
  parentPhoneHint: string | null;
}

@Injectable()
export class ParentAuthService {
  private readonly failedAttempts = new Map<
    string,
    { count: number; expiresAt: number }
  >();

  constructor(
    private readonly studentsService: StudentsService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Searches only by an exact normalized name and returns masked hints. The
   * opaque lookup token is short-lived and signed with a different secret
   * from the real parent access token, so it cannot authorize portal APIs.
   */
  async searchByFullName(
    dto: SearchStudentByNameDto,
  ): Promise<ParentStudentLookupResult[]> {
    const fullName =
      dto.fullName ?? dto.query ?? dto.search ?? dto.name ?? dto.keyword;
    if (!fullName) {
      throw AppException.badRequest(ErrorCode.VALIDATION_ERROR);
    }
    const normalizedName = fullName.trim().replace(/\s+/g, ' ');
    if (normalizedName.length < 3) return [];

    const students = await this.studentsService.searchByFullName(
      normalizedName,
      dto.schoolId,
    );

    return Promise.all(
      students.map(async (student) => ({
        lookupToken: await this.issueLookupToken(student),
        displayName: this.maskName(student.fullName),
        dateOfBirthHint: this.maskDateOfBirth(student.dateOfBirth),
        parentPhoneHint: this.maskPhone(student.parentPhone ?? student.phone),
      })),
    );
  }

  async verifyLookup(dto: VerifyStudentAccessDto): Promise<ParentAccessResult> {
    const payload = await this.verifyLookupToken(dto.lookupToken);
    const attemptKey = payload.candidateProof;
    this.assertVerificationAttemptsAvailable(attemptKey);
    const studentId = this.decryptCandidateRef(payload.candidateRef);
    let student: Student | undefined;
    try {
      student = await this.studentsService.findById(studentId);
    } catch {
      student = undefined;
    }

    const candidateMatches = Boolean(
      student &&
      student.schoolId === payload.schoolId &&
      this.matchesCandidateProof(student, payload),
    );
    const passwordMatches = student
      ? await this.studentsService.validateParentPassword(
          student.id,
          payload.schoolId,
          dto.password,
        )
      : false;

    if (!candidateMatches || !passwordMatches || !student) {
      this.recordFailedVerification(attemptKey);
      throw AppException.unauthorized(ErrorCode.PARENT_VERIFICATION_FAILED);
    }

    this.failedAttempts.delete(attemptKey);
    return this.issueAccessToken(student);
  }

  private assertVerificationAttemptsAvailable(attemptKey: string): void {
    const attempt = this.failedAttempts.get(attemptKey);
    if (!attempt) return;
    if (attempt.expiresAt <= Date.now()) {
      this.failedAttempts.delete(attemptKey);
      return;
    }
    if (attempt.count >= 5) {
      throw AppException.unauthorized(ErrorCode.PARENT_VERIFICATION_FAILED);
    }
  }

  private recordFailedVerification(attemptKey: string): void {
    const current = this.failedAttempts.get(attemptKey);
    this.failedAttempts.set(attemptKey, {
      count: (current?.count ?? 0) + 1,
      expiresAt: current?.expiresAt ?? Date.now() + 10 * 60 * 1000,
    });
  }

  private async issueLookupToken(student: Student): Promise<string> {
    const payload: ParentLookupJwtPayload = {
      purpose: 'parent-student-lookup',
      candidateRef: this.encryptCandidateRef(student.id),
      candidateProof: this.createCandidateProof(student.id, student.schoolId),
      schoolId: student.schoolId,
    };

    return this.jwtService.signAsync(
      payload as unknown as Record<string, unknown>,
      {
        secret: this.config.get<string>('parentLookupJwt.secret'),
        expiresIn: this.config.get<string>(
          'parentLookupJwt.expiresIn',
        ) as JwtSignOptions['expiresIn'],
      },
    );
  }

  private async verifyLookupToken(
    lookupToken: string,
  ): Promise<ParentLookupJwtPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<ParentLookupJwtPayload>(
        lookupToken,
        { secret: this.config.get<string>('parentLookupJwt.secret') },
      );
      if (
        payload.purpose !== 'parent-student-lookup' ||
        !payload.candidateRef ||
        !payload.candidateProof ||
        !payload.schoolId
      ) {
        throw new Error('Invalid parent lookup token purpose');
      }
      return payload;
    } catch {
      throw AppException.unauthorized(ErrorCode.PARENT_VERIFICATION_FAILED);
    }
  }

  private async issueAccessToken(
    student: Student,
  ): Promise<ParentAccessResult> {
    const payload: ParentJwtPayload = {
      studentId: student.id,
      authVersion: 2,
    };
    const accessToken = await this.jwtService.signAsync(
      payload as unknown as Record<string, unknown>,
      {
        secret: this.config.get<string>('parentJwt.secret'),
        expiresIn: this.config.get<string>(
          'parentJwt.expiresIn',
        ) as JwtSignOptions['expiresIn'],
      },
    );

    return { accessToken, student };
  }

  private maskName(fullName: string): string {
    return fullName
      .trim()
      .split(/\s+/)
      .map((part) => `${part[0]}${'*'.repeat(Math.max(0, part.length - 1))}`)
      .join(' ');
  }

  private maskDateOfBirth(dateOfBirth: string | null): string | null {
    const year = dateOfBirth?.match(/^(\d{4})/)?.[1];
    return year ? `**/**/${year}` : null;
  }

  private maskPhone(phone: string | null): string | null {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (!digits) return null;
    const visibleLength = Math.min(3, digits.length);
    return `${'*'.repeat(digits.length - visibleLength)}${digits.slice(-visibleLength)}`;
  }

  private createCandidateProof(studentId: string, schoolId: string): string {
    return createHmac(
      'sha256',
      this.config.get<string>('parentLookupJwt.secret') ?? '',
    )
      .update(`${schoolId}:${studentId}`)
      .digest('base64url');
  }

  private lookupEncryptionKey(): Buffer {
    return createHash('sha256')
      .update(this.config.get<string>('parentLookupJwt.secret') ?? '')
      .digest();
  }

  private encryptCandidateRef(studentId: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      'aes-256-gcm',
      this.lookupEncryptionKey(),
      iv,
    );
    const encrypted = Buffer.concat([
      cipher.update(studentId, 'utf8'),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
      'base64url',
    );
  }

  private decryptCandidateRef(candidateRef: string): string {
    try {
      const value = Buffer.from(candidateRef, 'base64url');
      const iv = value.subarray(0, 12);
      const authTag = value.subarray(12, 28);
      const encrypted = value.subarray(28);
      if (iv.length !== 12 || authTag.length !== 16 || !encrypted.length) {
        throw new Error('Invalid encrypted candidate reference');
      }
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.lookupEncryptionKey(),
        iv,
      );
      decipher.setAuthTag(authTag);
      return Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw AppException.unauthorized(ErrorCode.PARENT_VERIFICATION_FAILED);
    }
  }

  private matchesCandidateProof(
    student: Student,
    payload: ParentLookupJwtPayload,
  ): boolean {
    const expected = Buffer.from(
      this.createCandidateProof(student.id, payload.schoolId),
    );
    const actual = Buffer.from(payload.candidateProof);
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }
}
