import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { FeePlan } from './entities/fee-plan.entity';
import { CreateFeePlanDto } from './dto/create-fee-plan.dto';
import { UpdateFeePlanDto } from './dto/update-fee-plan.dto';
import { QueryFeePlanDto } from './dto/query-fee-plan.dto';
import { PaginatedResult } from '../common/dto/paginated-result.dto';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';

@Injectable()
export class FeePlansService {
  constructor(
    @InjectRepository(FeePlan)
    private readonly repo: Repository<FeePlan>,
  ) {}

  async create(dto: CreateFeePlanDto, userId?: string): Promise<FeePlan> {
    const unitPrice = new Decimal(dto.unitPrice);
    const quantity = new Decimal(dto.quantity);
    const entity = this.repo.create({
      ...dto,
      unitPrice,
      quantity,
      defaultAmount: unitPrice.times(quantity),
      createdBy: userId ?? null,
    });
    return this.repo.save(entity);
  }

  async findAll(query: QueryFeePlanDto): Promise<PaginatedResult<FeePlan>> {
    const qb = this.repo
      .createQueryBuilder('fp')
      .leftJoinAndSelect('fp.feeCategory', 'feeCategory')
      .orderBy(`fp.${query.sortBy ?? 'createdAt'}`, query.sortOrder ?? 'DESC');

    if (query.schoolId)
      qb.andWhere('fp.schoolId = :schoolId', { schoolId: query.schoolId });
    if (query.academicYearId)
      qb.andWhere('fp.academicYearId = :ayId', { ayId: query.academicYearId });
    if (query.feeCategoryId)
      qb.andWhere('fp.feeCategoryId = :fcId', { fcId: query.feeCategoryId });
    if (query.status)
      qb.andWhere('fp.status = :status', { status: query.status });
    if (query.search)
      qb.andWhere('(fp.name ILIKE :search OR fp.code ILIKE :search)', {
        search: `%${query.search}%`,
      });

    const [data, total] = await qb
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();
    return new PaginatedResult(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async findById(id: string): Promise<FeePlan> {
    const entity = await this.repo.findOne({
      where: { id },
      relations: { feeCategory: true },
    });
    if (!entity) throw AppException.notFound(ErrorCode.FEE_PLAN_NOT_FOUND);
    return entity;
  }

  async update(id: string, dto: UpdateFeePlanDto): Promise<FeePlan> {
    const entity = await this.findById(id);
    const unitPrice =
      dto.unitPrice !== undefined
        ? new Decimal(dto.unitPrice)
        : entity.unitPrice;
    const quantity =
      dto.quantity !== undefined ? new Decimal(dto.quantity) : entity.quantity;
    Object.assign(entity, dto, {
      unitPrice,
      quantity,
      defaultAmount: unitPrice.times(quantity),
    });
    return this.repo.save(entity);
  }

  async remove(id: string): Promise<void> {
    const entity = await this.findById(id);
    await this.repo.remove(entity);
  }
}
