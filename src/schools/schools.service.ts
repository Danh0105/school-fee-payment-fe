import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, QueryFailedError, Repository } from 'typeorm';
import { School } from './entities/school.entity';
import { CreateSchoolDto } from './dto/create-school.dto';
import { UpdateSchoolDto } from './dto/update-school.dto';
import { QuerySchoolDto } from './dto/query-school.dto';
import { PaginatedResult } from '../common/dto/paginated-result.dto';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { applySchoolScope } from '../common/utils/school-scope.util';
import { SequenceService } from '../database/sequence.service';
import { EntityStatus } from '../common/enums/status.enum';

const SCHOOL_CODE_PREFIX = 'SCH';
const SCHOOL_CODE_SCOPE = 'SCHOOL';
const SCHOOL_CODE_PADDING = 6;

@Injectable()
export class SchoolsService {
  constructor(
    @InjectRepository(School)
    private readonly schoolRepository: Repository<School>,
    private readonly sequenceService: SequenceService,
  ) {}

  async create(dto: CreateSchoolDto): Promise<School> {
    const requestedCode = dto.code?.trim();

    if (requestedCode) {
      const existing = await this.schoolRepository.findOne({
        where: { code: requestedCode, deletedAt: IsNull() },
      });
      if (existing) {
        throw AppException.conflict(ErrorCode.SCHOOL_CODE_EXISTS);
      }

      try {
        return await this.saveNewSchool(dto, requestedCode);
      } catch (error) {
        if (this.isUniqueViolation(error)) {
          throw AppException.conflict(ErrorCode.SCHOOL_CODE_EXISTS);
        }
        throw error;
      }
    }

    // SequenceService allocates values atomically. Retrying unique violations
    // also handles a generated code colliding with a legacy client-supplied code.
    for (;;) {
      const generatedCode = await this.sequenceService.generateCode(
        SCHOOL_CODE_PREFIX,
        SCHOOL_CODE_SCOPE,
        SCHOOL_CODE_PADDING,
      );
      try {
        return await this.saveNewSchool(dto, generatedCode);
      } catch (error) {
        if (!this.isUniqueViolation(error)) throw error;
      }
    }
  }

  private saveNewSchool(dto: CreateSchoolDto, code: string): Promise<School> {
    const school = this.schoolRepository.create({
      ...dto,
      code,
      managerInfo: dto.managerInfo ?? null,
      salesRepresentative: dto.salesRepresentative ?? null,
    });
    return this.schoolRepository.save(school);
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as { code?: string };
    return driverError.code === '23505';
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

  /**
   * Minimal, unauthenticated-safe school list (id/name/code only, no bank
   * or manager info) for pickers on public screens — e.g. the parent-portal
   * "chọn trường" step before entering a student's identifierCode.
   */
  async findAllPublicSummary(): Promise<
    Pick<School, 'id' | 'name' | 'code'>[]
  > {
    return this.schoolRepository.find({
      where: { status: EntityStatus.ACTIVE, deletedAt: IsNull() },
      select: { id: true, name: true, code: true },
      order: { name: 'ASC' },
    });
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
