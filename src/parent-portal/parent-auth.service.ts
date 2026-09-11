import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { StudentsService } from '../students/students.service';
import { StudentAccessDto } from './dto/student-access.dto';
import { ParentJwtPayload } from './interfaces/parent-jwt-payload.interface';
import { Student } from '../students/entities/student.entity';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';

export interface ParentAccessResult {
  accessToken: string;
  student: Student;
}

@Injectable()
export class ParentAuthService {
  private readonly logger = new Logger(ParentAuthService.name);

  constructor(
    private readonly studentsService: StudentsService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * No account/password — a parent proves they know their child's
   * identifierCode (CCCD) and is handed a token scoped to that one student.
   * identifierCode isn't enforced unique at the DB level (see
   * StudentsService.findByIdentifierCode), so more than one match is
   * treated the same as no match: we cannot safely guess which student was
   * meant, and the request is logged for an admin to fix the duplicate data.
   */
  async accessByIdentifierCode(
    dto: StudentAccessDto,
  ): Promise<ParentAccessResult> {
    const identifierCode = dto.identifierCode.trim();
    const matches = await this.studentsService.findByIdentifierCode(
      identifierCode,
      dto.schoolId,
    );

    if (matches.length !== 1) {
      if (matches.length > 1) {
        this.logger.warn(
          `Ambiguous identifierCode lookup: "${identifierCode}" in school ${dto.schoolId} matched ${matches.length} students`,
        );
      }
      throw AppException.notFound(ErrorCode.STUDENT_IDENTIFIER_NOT_FOUND);
    }

    const student = matches[0];
    const payload: ParentJwtPayload = { studentId: student.id };
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
