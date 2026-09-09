import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { School } from './entities/school.entity';
import { CreateSchoolDto } from './dto/create-school.dto';
import { UpdateSchoolDto } from './dto/update-school.dto';
import { QuerySchoolDto } from './dto/query-school.dto';
import { PaginatedResult } from '../common/dto/paginated-result.dto';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { applySchoolScope } from '../common/utils/school-scope.util';

@Injectable()
export class SchoolsService {
  constructor(
    @InjectRepository(School)
    private readonly schoolRepository: Repository<School>,
  ) {}

  async create(dto: CreateSchoolDto): Promise<School> {
    const existing = await this.schoolRepository.findOne({
      where: { code: dto.code, deletedAt: IsNull() },
    });
    if (existing) {
      throw AppException.conflict(ErrorCode.SCHOOL_CODE_EXISTS);
    }
    const school = this.schoolRepository.create(dto);
    return this.schoolRepository.save(school);
  }

  async findAll(
    query: QuerySchoolDto,
    scopedIds?: string[] | null,
  ): Promise<PaginatedResult<School>> {
    const qb = this.schoolRepository
      .createQueryBuilder('school')
      .where('school.deletedAt IS NULL')
      .orderBy(
        `school.${query.sortBy ?? 'createdAt'}`,
        query.sortOrder ?? 'DESC',
      );

    if (!applySchoolScope(qb, 'school.id', scopedIds ?? null)) {
      return new PaginatedResult([], 0, query.page ?? 1, query.limit ?? 20);
    }

    if (query.status)
      qb.andWhere('school.status = :status', { status: query.status });
    if (query.companyId)
      qb.andWhere('school.companyId = :companyId', {
        companyId: query.companyId,
      });
    if (query.search) {
      qb.andWhere('(school.name ILIKE :search OR school.code ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }

    const [data, total] = await qb
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();
    return new PaginatedResult(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async findIdsByCompany(companyId: string): Promise<string[]> {
    const rows = await this.schoolRepository.find({
      where: { companyId, deletedAt: IsNull() },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async findByBankAccountNumber(
    bankAccountNumber: string,
  ): Promise<School | null> {
    return this.schoolRepository.findOne({
      where: { bankAccountNumber, deletedAt: IsNull() },
    });
  }

  async findById(id: string): Promise<School> {
    const school = await this.schoolRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!school) throw AppException.notFound(ErrorCode.SCHOOL_NOT_FOUND);
    return school;
  }

  async update(id: string, dto: UpdateSchoolDto): Promise<School> {
    const school = await this.findById(id);
    if (dto.code && dto.code !== school.code) {
      const existing = await this.schoolRepository.findOne({
        where: { code: dto.code, deletedAt: IsNull() },
      });
      if (existing) throw AppException.conflict(ErrorCode.SCHOOL_CODE_EXISTS);
    }
    Object.assign(school, dto);
    return this.schoolRepository.save(school);
  }

  async softDelete(id: string): Promise<void> {
    const school = await this.findById(id);
    school.deletedAt = new Date();
    await this.schoolRepository.save(school);
  }
}
