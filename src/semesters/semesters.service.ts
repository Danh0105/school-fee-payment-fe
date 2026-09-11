import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Semester } from './entities/semester.entity';
import { QuerySemesterDto } from './dto/query-semester.dto';
import { PaginatedResult } from '../common/dto/paginated-result.dto';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { AcademicYear } from '../academic-years/entities/academic-year.entity';
import {
  AcademicYearStatus,
  SemesterStatus,
} from '../common/enums/status.enum';

const DEFAULT_SEMESTER_CODES = ['HK1', 'HK2'] as const;

const SEMESTER_STATUS_BY_ACADEMIC_YEAR: Record<
  AcademicYearStatus,
  SemesterStatus
> = {
  [AcademicYearStatus.DRAFT]: SemesterStatus.DRAFT,
  [AcademicYearStatus.ACTIVE]: SemesterStatus.ACTIVE,
  [AcademicYearStatus.CLOSED]: SemesterStatus.CLOSED,
};

@Injectable()
export class SemestersService {
  constructor(
    @InjectRepository(Semester)
    private readonly repo: Repository<Semester>,
  ) {}

  async synchronizeDefaults(
    academicYear: AcademicYear,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(Semester) : this.repo;
    const { firstEndDate, secondStartDate } = this.splitAcademicYear(
      academicYear.startDate,
      academicYear.endDate,
    );
    const status = SEMESTER_STATUS_BY_ACADEMIC_YEAR[academicYear.status];

    await repo.upsert(
      [
        {
          academicYearId: academicYear.id,
          code: 'HK1',
          name: 'Học kỳ 1',
          startDate: academicYear.startDate,
          endDate: firstEndDate,
          status,
        },
        {
          academicYearId: academicYear.id,
          code: 'HK2',
          name: 'Học kỳ 2',
          startDate: secondStartDate,
          endDate: academicYear.endDate,
          status,
        },
      ],
      ['academicYearId', 'code'],
    );
  }

  async findAll(query: QuerySemesterDto): Promise<PaginatedResult<Semester>> {
    const qb = this.repo
      .createQueryBuilder('s')
      .where('s.code IN (:...defaultCodes)', {
        defaultCodes: DEFAULT_SEMESTER_CODES,
      })
      .orderBy(`s.${query.sortBy ?? 'startDate'}`, query.sortOrder ?? 'ASC');
    if (query.academicYearId)
      qb.andWhere('s.academicYearId = :id', { id: query.academicYearId });
    if (query.search)
      qb.andWhere('s.name ILIKE :search', { search: `%${query.search}%` });

    const [data, total] = await qb
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();
    return new PaginatedResult(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async findById(id: string): Promise<Semester> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw AppException.notFound(ErrorCode.SEMESTER_NOT_FOUND);
    return entity;
  }

  /** Returns the academic year's HK1/HK2 pair, ordered by start date. synchronizeDefaults guarantees both exist for every academic year. */
  async findPairByAcademicYear(academicYearId: string): Promise<Semester[]> {
    const semesters = await this.repo.find({
      where: { academicYearId },
      order: { startDate: 'ASC' },
    });
    if (semesters.length < 2) {
      throw AppException.notFound(ErrorCode.SEMESTER_NOT_FOUND);
    }
    return semesters;
  }

  private splitAcademicYear(
    startDate: string,
    endDate: string,
  ): { firstEndDate: string; secondStartDate: string } {
    const dayInMilliseconds = 86_400_000;
    const start = Date.parse(`${startDate}T00:00:00.000Z`);
    const end = Date.parse(`${endDate}T00:00:00.000Z`);
    const totalDays = Math.floor((end - start) / dayInMilliseconds) + 1;
    const secondStartOffset = Math.max(0, Math.floor(totalDays / 2));
    const firstEndOffset = Math.max(0, secondStartOffset - 1);

    return {
      firstEndDate: new Date(start + firstEndOffset * dayInMilliseconds)
        .toISOString()
        .slice(0, 10),
      secondStartDate: new Date(start + secondStartOffset * dayInMilliseconds)
        .toISOString()
        .slice(0, 10),
    };
  }
}
