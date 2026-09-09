import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Semester } from './entities/semester.entity';
import { CreateSemesterDto } from './dto/create-semester.dto';
import { UpdateSemesterDto } from './dto/update-semester.dto';
import { QuerySemesterDto } from './dto/query-semester.dto';
import { PaginatedResult } from '../common/dto/paginated-result.dto';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';

@Injectable()
export class SemestersService {
  constructor(
    @InjectRepository(Semester)
    private readonly repo: Repository<Semester>,
  ) {}

  async create(dto: CreateSemesterDto): Promise<Semester> {
    return this.repo.save(this.repo.create(dto));
  }

  async findAll(query: QuerySemesterDto): Promise<PaginatedResult<Semester>> {
    const qb = this.repo
      .createQueryBuilder('s')
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

  async update(id: string, dto: UpdateSemesterDto): Promise<Semester> {
    const entity = await this.findById(id);
    Object.assign(entity, dto);
    return this.repo.save(entity);
  }

  async remove(id: string): Promise<void> {
    const entity = await this.findById(id);
    await this.repo.remove(entity);
  }
}
