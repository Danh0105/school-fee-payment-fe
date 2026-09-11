import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, QueryFailedError, Repository } from 'typeorm';
import { Student } from './entities/student.entity';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { QueryStudentDto } from './dto/query-student.dto';
import { PaginatedResult } from '../common/dto/paginated-result.dto';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { SchoolsService } from '../schools/schools.service';
import { SequenceService } from '../database/sequence.service';
import { StudentClass } from '../student-classes/entities/student-class.entity';
import { applySchoolScope } from '../common/utils/school-scope.util';

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(Student)
    private readonly repo: Repository<Student>,
    private readonly schoolsService: SchoolsService,
    private readonly sequenceService: SequenceService,
  ) {}

  async create(
    dto: CreateStudentDto,
    manager?: EntityManager,
  ): Promise<Student> {
    const repo = manager ? manager.getRepository(Student) : this.repo;
    const school = await this.schoolsService.findById(dto.schoolId);

    const identifierCode = dto.identifierCode?.trim() || undefined;
    if (identifierCode) {
      await this.assertIdentifierCodeAvailable(
        repo,
        dto.schoolId,
        identifierCode,
      );
    }
    const createDto = { ...dto, identifierCode };

    const requestedCode = dto.studentCode?.trim();
    if (requestedCode) {
      const existing = await repo.findOne({
        where: {
          schoolId: dto.schoolId,
          studentCode: requestedCode,
          deletedAt: IsNull(),
        },
      });
      if (existing) throw AppException.conflict(ErrorCode.STUDENT_CODE_EXISTS);

      try {
        return await this.saveNewStudent(repo, createDto, requestedCode);
      } catch (error) {
        throw this.mapUniqueViolation(error);
      }
    }

    for (;;) {
      const seq = await this.sequenceService.next(
        `STUDENT:${school.code}`,
        manager,
      );
      const studentCode = `${school.code}${String(seq).padStart(9, '0')}`;
      const existing = await repo.findOne({
        where: { schoolId: dto.schoolId, studentCode },
      });
      if (existing) continue;

      try {
        return await this.saveNewStudent(repo, createDto, studentCode);
      } catch (error) {
        throw this.mapUniqueViolation(error);
      }
    }
  }

  private async assertIdentifierCodeAvailable(
    repo: Repository<Student>,
    schoolId: string,
    identifierCode: string,
    excludeStudentId?: string,
  ): Promise<void> {
    const existing = await repo.findOne({
      where: { schoolId, identifierCode, deletedAt: IsNull() },
    });
    if (existing && existing.id !== excludeStudentId) {
      throw AppException.conflict(ErrorCode.STUDENT_IDENTIFIER_CODE_EXISTS);
    }
  }

  private saveNewStudent(
    repo: Repository<Student>,
    dto: CreateStudentDto,
    studentCode: string,
  ): Promise<Student> {
    return repo.save(repo.create({ ...dto, studentCode }));
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as { code?: string };
    return driverError.code === '23505';
  }

  /** Translates a raw DB unique-violation into the matching AppException — a fallback for the race the pre-check can't fully close. */
  private mapUniqueViolation(error: unknown): unknown {
    if (!this.isUniqueViolation(error)) return error;
    const driverError = (error as QueryFailedError).driverError as {
      constraint?: string;
    };
    if (driverError.constraint === 'IDX_students_school_id_identifier_code') {
      return AppException.conflict(ErrorCode.STUDENT_IDENTIFIER_CODE_EXISTS);
    }
    return AppException.conflict(ErrorCode.STUDENT_CODE_EXISTS);
  }

  async findByStudentCode(
    schoolId: string,
    studentCode: string,
    manager?: EntityManager,
  ): Promise<Student | null> {
    const repo = manager ? manager.getRepository(Student) : this.repo;
    return repo.findOne({
      where: { schoolId, studentCode, deletedAt: IsNull() },
    });
  }

  async findAll(
    query: QueryStudentDto,
    scopedIds?: string[] | null,
  ): Promise<PaginatedResult<Student>> {
    const qb = this.repo
      .createQueryBuilder('student')
      .where('student.deletedAt IS NULL')
      .orderBy(
        `student.${query.sortBy ?? 'createdAt'}`,
        query.sortOrder ?? 'DESC',
      );

    if (!applySchoolScope(qb, 'student.schoolId', scopedIds ?? null)) {
      return new PaginatedResult([], 0, query.page ?? 1, query.limit ?? 20);
    }
    if (query.schoolId)
      qb.andWhere('student.schoolId = :schoolId', { schoolId: query.schoolId });
    if (query.status)
      qb.andWhere('student.status = :status', { status: query.status });
    if (query.classId) {
      qb.innerJoin(
        StudentClass,
        'sc',
        'sc.studentId = student.id AND sc.classId = :classId AND sc.status = :scStatus',
        { classId: query.classId, scStatus: 'ACTIVE' },
      );
    }
    if (query.search) {
      qb.andWhere(
        '(student.fullName ILIKE :search OR student.studentCode ILIKE :search)',
        {
          search: `%${query.search}%`,
        },
      );
    }

    const [data, total] = await qb
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();
    return new PaginatedResult(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async findById(id: string): Promise<Student> {
    const student = await this.repo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!student) throw AppException.notFound(ErrorCode.STUDENT_NOT_FOUND);
    return student;
  }

  /**
   * Looks up students by their identifierCode (CCCD/mã định danh) *within a
   * given school*, for the parent-portal access flow — a parent picks their
   * child's school, then enters the identifierCode, to reach that student's
   * payment page (no account/password involved). identifierCode is unique
   * per school at the DB level (see migration UniqueStudentIdentifierCode),
   * so this should only ever return 0 or 1 rows for well-formed data — it
   * still returns an array so the caller can defend against pre-existing
   * duplicate data created before that constraint was added.
   */
  async findByIdentifierCode(
    identifierCode: string,
    schoolId: string,
  ): Promise<Student[]> {
    return this.repo.find({
      where: { identifierCode, schoolId, deletedAt: IsNull() },
      relations: { school: true },
    });
  }

  async update(id: string, dto: UpdateStudentDto): Promise<Student> {
    const student = await this.findById(id);
    const identifierCode = dto.identifierCode?.trim() || undefined;
    if (identifierCode && identifierCode !== student.identifierCode) {
      await this.assertIdentifierCodeAvailable(
        this.repo,
        student.schoolId,
        identifierCode,
        student.id,
      );
    }
    Object.assign(student, dto, identifierCode ? { identifierCode } : {});
    try {
      return await this.repo.save(student);
    } catch (error) {
      throw this.mapUniqueViolation(error);
    }
  }

  async softDelete(id: string): Promise<void> {
    const student = await this.findById(id);
    student.deletedAt = new Date();
    await this.repo.save(student);
  }
}
