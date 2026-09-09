import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
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

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(Student)
    private readonly repo: Repository<Student>,
    private readonly schoolsService: SchoolsService,
    private readonly sequenceService: SequenceService,
  ) {}

  async create(dto: CreateStudentDto): Promise<Student> {
    const school = await this.schoolsService.findById(dto.schoolId);

    let studentCode = dto.studentCode;
    if (!studentCode) {
      const seq = await this.sequenceService.next(`STUDENT:${school.code}`);
      studentCode = `${school.code}${String(seq).padStart(9, '0')}`;
    } else {
      const existing = await this.repo.findOne({
        where: { schoolId: dto.schoolId, studentCode, deletedAt: IsNull() },
      });
      if (existing) throw AppException.conflict(ErrorCode.STUDENT_CODE_EXISTS);
    }

    const student = this.repo.create({ ...dto, studentCode });
    return this.repo.save(student);
  }

  async findAll(query: QueryStudentDto): Promise<PaginatedResult<Student>> {
    const qb = this.repo
      .createQueryBuilder('student')
      .where('student.deletedAt IS NULL')
      .orderBy(`student.${query.sortBy ?? 'createdAt'}`, query.sortOrder ?? 'DESC');

    if (query.schoolId) qb.andWhere('student.schoolId = :schoolId', { schoolId: query.schoolId });
    if (query.status) qb.andWhere('student.status = :status', { status: query.status });
    if (query.classId) {
      qb.innerJoin(
        StudentClass,
        'sc',
        'sc.studentId = student.id AND sc.classId = :classId AND sc.status = :scStatus',
        { classId: query.classId, scStatus: 'ACTIVE' },
      );
    }
    if (query.search) {
      qb.andWhere('(student.fullName ILIKE :search OR student.studentCode ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }

    const [data, total] = await qb.skip(query.skip).take(query.limit).getManyAndCount();
    return new PaginatedResult(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async findById(id: string): Promise<Student> {
    const student = await this.repo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!student) throw AppException.notFound(ErrorCode.STUDENT_NOT_FOUND);
    return student;
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
