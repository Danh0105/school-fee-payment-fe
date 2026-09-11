import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { FeePlan } from './entities/fee-plan.entity';
import { CreateFeePlanDto } from './dto/create-fee-plan.dto';
import { UpdateFeePlanDto } from './dto/update-fee-plan.dto';
import { QueryFeePlanDto } from './dto/query-fee-plan.dto';
import { PaginatedResult } from '../common/dto/paginated-result.dto';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { applySchoolScope } from '../common/utils/school-scope.util';
import { BillingType } from '../common/enums/status.enum';
import { AcademicYearsService } from '../academic-years/academic-years.service';
import { FeeCategoriesService } from '../fee-categories/fee-categories.service';
import { SequenceService } from '../database/sequence.service';

@Injectable()
export class FeePlansService {
  constructor(
    @InjectRepository(FeePlan)
    private readonly repo: Repository<FeePlan>,
    private readonly academicYearsService: AcademicYearsService,
    private readonly feeCategoriesService: FeeCategoriesService,
    private readonly sequenceService: SequenceService,
  ) {}

  async create(dto: CreateFeePlanDto, userId?: string): Promise<FeePlan> {
    const feeCategory = await this.feeCategoriesService.findById(
      dto.feeCategoryId,
    );
    const academicYear = await this.academicYearsService.getCurrent(
      dto.schoolId,
    );
    const unitPrice = new Decimal(dto.unitPrice);
    const quantity = new Decimal(dto.quantity);
    const billingType = quantity.equals(1)
      ? BillingType.ONE_TIME
      : BillingType.MONTHLY;
    const baseCode = `${feeCategory.code}-${this.buildYearSuffix(academicYear.name)}`;
    const scopeKey = `FEE_PLAN_CODE:${feeCategory.id}:${academicYear.id}`;

    const buildEntity = (code: string) =>
      this.repo.create({
        schoolId: dto.schoolId,
        academicYearId: academicYear.id,
        semesterId: null,
        feeCategoryId: dto.feeCategoryId,
        code,
        name: `${feeCategory.name} năm học ${academicYear.name}`,
        description: dto.description ?? null,
        billingType,
        unitPrice,
        quantity,
        defaultAmount: unitPrice.times(quantity),
        startDate: null,
        dueDate: null,
        status: dto.status,
        createdBy: userId ?? null,
      });

    // The category+year code is deterministic, so it usually saves on the
    // first try. Fall back to a sequence-suffixed code only if another plan
    // already claimed it (e.g. a prior plan for the same category/year).
    try {
      return await this.repo.save(buildEntity(baseCode));
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
    }

    for (;;) {
      const seq = await this.sequenceService.next(scopeKey);
      try {
        return await this.repo.save(buildEntity(`${baseCode}-${seq}`));
      } catch (error) {
        if (!this.isUniqueViolation(error)) throw error;
      }
    }
  }

  private buildYearSuffix(academicYearName: string): string {
    return academicYearName
      .split('-')
      .map((part) => part.slice(-2))
      .join('');
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as { code?: string };
    return driverError.code === '23505';
  }

  async findAll(
    query: QueryFeePlanDto,
    scopedIds?: string[] | null,
  ): Promise<PaginatedResult<FeePlan>> {
    const qb = this.repo
      .createQueryBuilder('fp')
      .leftJoinAndSelect('fp.feeCategory', 'feeCategory')
      .orderBy(`fp.${query.sortBy ?? 'createdAt'}`, query.sortOrder ?? 'DESC');

    if (!applySchoolScope(qb, 'fp.schoolId', scopedIds ?? null)) {
      return new PaginatedResult([], 0, query.page ?? 1, query.limit ?? 20);
    }
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
