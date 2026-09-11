import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Class } from './entities/class.entity';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { QueryClassDto } from './dto/query-class.dto';
import { PaginatedResult } from '../common/dto/paginated-result.dto';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { applySchoolScope } from '../common/utils/school-scope.util';
import { AcademicYearsService } from '../academic-years/academic-years.service';
import { SequenceService } from '../database/sequence.service';

const CLASS_CODE_PREFIX = 'CLS';
const CLASS_CODE_PADDING = 6;

@Injectable()
export class ClassesService {
  constructor(
    @InjectRepository(Class)
    private readonly repo: Repository<Class>,
    private readonly academicYearsService: AcademicYearsService,
    private readonly sequenceService: SequenceService,
  ) {}

  async create(dto: CreateClassDto): Promise<Class> {
    const academicYear = dto.academicYearId
      ? await this.academicYearsService.findById(dto.academicYearId)
      : await this.academicYearsService.getCurrent(dto.schoolId);
    if (academicYear.schoolId !== dto.schoolId) {
      throw AppException.badRequest(ErrorCode.VALIDATION_ERROR);
    }

    const requestedCode = dto.code?.trim();
    if (requestedCode) {
      const existing = await this.repo.findOne({
        where: {
          schoolId: dto.schoolId,
          academicYearId: academicYear.id,
          code: requestedCode,
        },
      });
      if (existing) throw AppException.conflict(ErrorCode.CLASS_CODE_EXISTS);

      try {
        return await this.saveNewClass(dto, academicYear.id, requestedCode);
      } catch (error) {
        if (this.isUniqueViolation(error)) {
          throw AppException.conflict(ErrorCode.CLASS_CODE_EXISTS);
        }
        throw error;
      }
    }

    for (;;) {
      const code = await this.sequenceService.generateCode(
        CLASS_CODE_PREFIX,
        `CLASS:${dto.schoolId}:${academicYear.id}`,
        CLASS_CODE_PADDING,
      );
      try {
        return await this.saveNewClass(dto, academicYear.id, code);
      } catch (error) {
        if (!this.isUniqueViolation(error)) throw error;
      }
    }
  }

  private saveNewClass(
    dto: CreateClassDto,
    academicYearId: string,
    code: string,
  ): Promise<Class> {
    return this.repo.save(this.repo.create({ ...dto, academicYearId, code }));
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as { code?: string };
    return driverError.code === '23505';
  }

  async findAll(
    query: QueryClassDto,
    scopedIds?: string[] | null,
  ): Promise<PaginatedResult<Class>> {
    const qb = this.repo
      .createQueryBuilder('c')
      .orderBy(`c.${query.sortBy ?? 'code'}`, query.sortOrder ?? 'ASC');
    if (!applySchoolScope(qb, 'c.schoolId', scopedIds ?? null)) {
      return new PaginatedResult([], 0, query.page ?? 1, query.limit ?? 20);
    }
    if (query.schoolId)
      qb.andWhere('c.schoolId = :schoolId', { schoolId: query.schoolId });
    if (query.academicYearId)
      qb.andWhere('c.academicYearId = :ayId', { ayId: query.academicYearId });
    if (query.search)
      qb.andWhere('(c.name ILIKE :search OR c.code ILIKE :search)', {
        search: `%${query.search}%`,
      });

    const [data, total] = await qb
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();
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
