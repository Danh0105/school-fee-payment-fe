import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentClass } from './entities/student-class.entity';
import { Student } from '../students/entities/student.entity';
import { AssignStudentClassDto } from './dto/assign-student-class.dto';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { StudentClassStatus } from '../common/enums/status.enum';

@Injectable()
export class StudentClassesService {
  constructor(
    @InjectRepository(StudentClass)
    private readonly repo: Repository<StudentClass>,
  ) {}

  async assign(dto: AssignStudentClassDto): Promise<StudentClass> {
    const existing = await this.repo.findOne({
      where: { studentId: dto.studentId, academicYearId: dto.academicYearId },
    });

    if (existing) {
      existing.classId = dto.classId;
      existing.status = StudentClassStatus.ACTIVE;
      existing.leftAt = null;
      return this.repo.save(existing);
    }

    return this.repo.save(
      this.repo.create({ ...dto, status: StudentClassStatus.ACTIVE }),
    );
  }

  async findActiveStudentsByClass(classId: string): Promise<Student[]> {
    const rows = await this.repo.find({
      where: { classId, status: StudentClassStatus.ACTIVE },
      relations: { student: true },
    });
    return rows.map((r) => r.student);
  }

  async findStudentIdsByTarget(params: {
    classIds?: string[];
    grade?: string;
    schoolId?: string;
    academicYearId: string;
  }): Promise<string[]> {
    const qb = this.repo
      .createQueryBuilder('sc')
      .innerJoin('sc.class', 'class')
      .where('sc.academicYearId = :ayId', { ayId: params.academicYearId })
      .andWhere('sc.status = :status', { status: StudentClassStatus.ACTIVE });

    if (params.classIds?.length)
      qb.andWhere('sc.classId IN (:...classIds)', {
        classIds: params.classIds,
      });
    if (params.grade)
      qb.andWhere('class.grade = :grade', { grade: params.grade });
    if (params.schoolId)
      qb.andWhere('class.schoolId = :schoolId', { schoolId: params.schoolId });

    const rows = await qb
      .select('sc.studentId', 'studentId')
      .getRawMany<{ studentId: string }>();
    return rows.map((r) => r.studentId);
  }

  async findByStudent(studentId: string): Promise<StudentClass[]> {
    return this.repo.find({
      where: { studentId },
      relations: { class: true, academicYear: true },
      order: { joinedAt: 'DESC' },
    });
  }

  async findActiveByStudentAndYear(
    studentId: string,
    academicYearId: string,
  ): Promise<StudentClass> {
    const entity = await this.repo.findOne({
      where: { studentId, academicYearId, status: StudentClassStatus.ACTIVE },
    });
    if (!entity)
      throw AppException.notFound(
        ErrorCode.CLASS_NOT_FOUND,
        'Học sinh chưa được xếp lớp trong năm học này',
      );
    return entity;
  }
}
