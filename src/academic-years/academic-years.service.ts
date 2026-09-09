import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AcademicYear } from './entities/academic-year.entity';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';
import { UpdateAcademicYearDto } from './dto/update-academic-year.dto';
import { QueryAcademicYearDto } from './dto/query-academic-year.dto';
import { PaginatedResult } from '../common/dto/paginated-result.dto';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { applySchoolScope } from '../common/utils/school-scope.util';

@Injectable()
export class AcademicYearsService {
  constructor(
    @InjectRepository(AcademicYear)
    private readonly repo: Repository<AcademicYear>,
  ) {}

  async create(dto: CreateAcademicYearDto): Promise<AcademicYear> {
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async findAll(
    query: QueryAcademicYearDto,
    scopedIds?: string[] | null,
  ): Promise<PaginatedResult<AcademicYear>> {
    const qb = this.repo
      .createQueryBuilder('ay')
      .orderBy(`ay.${query.sortBy ?? 'startDate'}`, query.sortOrder ?? 'DESC');
    if (!applySchoolScope(qb, 'ay.schoolId', scopedIds ?? null)) {
      return new PaginatedResult([], 0, query.page ?? 1, query.limit ?? 20);
    }
    if (query.schoolId)
      qb.andWhere('ay.schoolId = :schoolId', { schoolId: query.schoolId });
    if (query.status)
      qb.andWhere('ay.status = :status', { status: query.status });
    if (query.search)
      qb.andWhere('ay.name ILIKE :search', { search: `%${query.search}%` });

    const [data, total] = await qb
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();
    return new PaginatedResult(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async findById(id: string): Promise<AcademicYear> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw AppException.notFound(ErrorCode.ACADEMIC_YEAR_NOT_FOUND);
    return entity;
  }

  async update(id: string, dto: UpdateAcademicYearDto): Promise<AcademicYear> {
    const entity = await this.findById(id);
    Object.assign(entity, dto);
    return this.repo.save(entity);
  }

  async remove(id: string): Promise<void> {
    const entity = await this.findById(id);
    await this.repo.remove(entity);
  }
}
