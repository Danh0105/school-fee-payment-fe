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
        return await this.saveNewStudent(repo, dto, requestedCode);
      } catch (error) {
        if (this.isUniqueViolation(error)) {
          throw AppException.conflict(ErrorCode.STUDENT_CODE_EXISTS);
        }
        throw error;
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

      return this.saveNewStudent(repo, dto, studentCode);
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
   * payment page (no account/password involved). Scoping by schoolId keeps
   * this correct even though identifierCode has no DB-level unique
   * constraint (only deduped within a single Excel import): two different
   * schools could otherwise coincidentally share a code. Still returns
   * every match — the caller must treat more than one match within the same
   * school as ambiguous rather than guessing.
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
    Object.assign(student, dto);
    return this.repo.save(student);
  }

  async softDelete(id: string): Promise<void> {
    const student = await this.findById(id);
    student.deletedAt = new Date();
    await this.repo.save(student);
  }
}
