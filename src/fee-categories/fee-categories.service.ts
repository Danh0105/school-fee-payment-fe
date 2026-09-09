import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { FeeCategory } from './entities/fee-category.entity';
import { CreateFeeCategoryDto } from './dto/create-fee-category.dto';
import { UpdateFeeCategoryDto } from './dto/update-fee-category.dto';
import { QueryFeeCategoryDto } from './dto/query-fee-category.dto';
import { PaginatedResult } from '../common/dto/paginated-result.dto';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';

@Injectable()
export class FeeCategoriesService {
  constructor(
    @InjectRepository(FeeCategory)
    private readonly repo: Repository<FeeCategory>,
  ) {}

  async create(dto: CreateFeeCategoryDto): Promise<FeeCategory> {
    return this.repo.save(this.repo.create(dto));
  }

  async findAll(
    query: QueryFeeCategoryDto,
  ): Promise<PaginatedResult<FeeCategory>> {
    const qb = this.repo
      .createQueryBuilder('fc')
      .where('fc.deletedAt IS NULL')
      .orderBy(`fc.${query.sortBy ?? 'createdAt'}`, query.sortOrder ?? 'DESC');
    if (query.schoolId)
      qb.andWhere('fc.schoolId = :schoolId', { schoolId: query.schoolId });
    if (query.search)
      qb.andWhere('(fc.name ILIKE :search OR fc.code ILIKE :search)', {
        search: `%${query.search}%`,
      });

    const [data, total] = await qb
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();
    return new PaginatedResult(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async findById(id: string): Promise<FeeCategory> {
    const entity = await this.repo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!entity) throw AppException.notFound(ErrorCode.FEE_CATEGORY_NOT_FOUND);
    return entity;
  }

  async update(id: string, dto: UpdateFeeCategoryDto): Promise<FeeCategory> {
    const entity = await this.findById(id);
    Object.assign(entity, dto);
    return this.repo.save(entity);
  }

  async softDelete(id: string): Promise<void> {
    const entity = await this.findById(id);
    entity.deletedAt = new Date();
    await this.repo.save(entity);
  }
}
