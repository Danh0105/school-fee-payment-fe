import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Class } from './entities/class.entity';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { QueryClassDto } from './dto/query-class.dto';
import { PaginatedResult } from '../common/dto/paginated-result.dto';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';

@Injectable()
export class ClassesService {
  constructor(
    @InjectRepository(Class)
    private readonly repo: Repository<Class>,
  ) {}

  async create(dto: CreateClassDto): Promise<Class> {
    const existing = await this.repo.findOne({
      where: { schoolId: dto.schoolId, academicYearId: dto.academicYearId, code: dto.code },
    });
    if (existing) throw AppException.conflict(ErrorCode.CLASS_CODE_EXISTS);
    return this.repo.save(this.repo.create(dto));
  }

  async findAll(query: QueryClassDto): Promise<PaginatedResult<Class>> {
    const qb = this.repo.createQueryBuilder('c').orderBy(`c.${query.sortBy ?? 'code'}`, query.sortOrder ?? 'ASC');
    if (query.schoolId) qb.andWhere('c.schoolId = :schoolId', { schoolId: query.schoolId });
    if (query.academicYearId) qb.andWhere('c.academicYearId = :ayId', { ayId: query.academicYearId });
    if (query.search) qb.andWhere('(c.name ILIKE :search OR c.code ILIKE :search)', { search: `%${query.search}%` });

    const [data, total] = await qb.skip(query.skip).take(query.limit).getManyAndCount();
    return new PaginatedResult(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async findById(id: string): Promise<Class> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw AppException.notFound(ErrorCode.CLASS_NOT_FOUND);
    return entity;
  }

  async update(id: string, dto: UpdateClassDto): Promise<Class> {
    const entity = await this.findById(id);
    Object.assign(entity, dto);
    return this.repo.save(entity);
  }

  async remove(id: string): Promise<void> {
    const entity = await this.findById(id);
    await this.repo.remove(entity);
  }
}
