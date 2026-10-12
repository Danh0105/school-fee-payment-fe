import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import { StudentsService } from '../students/students.service';
import { ParentJwtPayload } from './interfaces/parent-jwt-payload.interface';
import { Student } from '../students/entities/student.entity';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { ParentLoginDto } from './dto/parent-login.dto';

export interface ParentAccessResult {
  accessToken: string;
  student: Student;
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

  async login(dto: ParentLoginDto): Promise<ParentAccessResult> {
    const normalizedPhone = dto.username.replace(/\D/g, '');
    const attemptKey = createHash('sha256')
      .update(`${dto.schoolId}:${normalizedPhone.slice(-9)}`)
      .digest('base64url');
    this.assertVerificationAttemptsAvailable(attemptKey);

    const dateOfBirth = this.passwordToDateOfBirth(dto.password);
    const matches = dateOfBirth
      ? await this.studentsService.findByParentCredentials(
          dto.schoolId,
          normalizedPhone,
          dateOfBirth,
        )
      : [];

    if (matches.length !== 1) {
      this.recordFailedVerification(attemptKey);
      throw AppException.unauthorized(ErrorCode.PARENT_VERIFICATION_FAILED);
    }

    this.failedAttempts.delete(attemptKey);
    return this.issueAccessToken(matches[0]);
  }

  private passwordToDateOfBirth(password: string): string | null {
    const day = Number(password.slice(0, 2));
    const month = Number(password.slice(2, 4));
    const year = Number(password.slice(4, 8));
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }
    return `${year.toString().padStart(4, '0')}-${month
      .toString()
      .padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
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

  private async issueAccessToken(
    student: Student,
  ): Promise<ParentAccessResult> {
    const payload: ParentJwtPayload = {
      studentId: student.id,
      authVersion: 3,
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
}
