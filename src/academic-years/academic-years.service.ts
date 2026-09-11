import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AcademicYear } from './entities/academic-year.entity';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';
import { UpdateAcademicYearDto } from './dto/update-academic-year.dto';
import { QueryAcademicYearDto } from './dto/query-academic-year.dto';
import { PaginatedResult } from '../common/dto/paginated-result.dto';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { applySchoolScope } from '../common/utils/school-scope.util';
import { SemestersService } from '../semesters/semesters.service';
import { AcademicYearStatus } from '../common/enums/status.enum';

const ACADEMIC_YEAR_START_MONTH = 9;
const ACADEMIC_YEAR_TIME_ZONE = 'Asia/Ho_Chi_Minh';

@Injectable()
export class AcademicYearsService {
  constructor(
    @InjectRepository(AcademicYear)
    private readonly repo: Repository<AcademicYear>,
    private readonly dataSource: DataSource,
    private readonly semestersService: SemestersService,
  ) {}

  async create(dto: CreateAcademicYearDto): Promise<AcademicYear> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AcademicYear);
      const entity = await repo.save(repo.create(dto));
      await this.semestersService.synchronizeDefaults(entity, manager);
      return entity;
    });
  }

  async getCurrent(
    schoolId: string,
    currentDate = new Date(),
  ): Promise<AcademicYear> {
    const period = this.resolveCurrentPeriod(currentDate);

    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AcademicYear);
      await repo.update(
        { schoolId, status: AcademicYearStatus.ACTIVE },
        { status: AcademicYearStatus.CLOSED },
      );
      await repo.upsert(
        {
          schoolId,
          name: period.name,
          startDate: period.startDate,
          endDate: period.endDate,
          status: AcademicYearStatus.ACTIVE,
        },
        ['schoolId', 'name'],
      );

      const entity = await repo.findOne({
        where: { schoolId, name: period.name },
      });
      if (!entity) {
        throw AppException.notFound(ErrorCode.ACADEMIC_YEAR_NOT_FOUND);
      }

      await this.semestersService.synchronizeDefaults(entity, manager);
      return entity;
    });
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
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AcademicYear);
      const entity = await repo.findOne({ where: { id } });
      if (!entity) {
        throw AppException.notFound(ErrorCode.ACADEMIC_YEAR_NOT_FOUND);
      }

      Object.assign(entity, dto);
      const saved = await repo.save(entity);
      await this.semestersService.synchronizeDefaults(saved, manager);
      return saved;
    });
  }

  async remove(id: string): Promise<void> {
    const entity = await this.findById(id);
    await this.repo.remove(entity);
  }

  private resolveCurrentPeriod(currentDate: Date): {
    name: string;
    startDate: string;
    endDate: string;
  } {
    const dateParts = new Intl.DateTimeFormat('en-US', {
      timeZone: ACADEMIC_YEAR_TIME_ZONE,
      year: 'numeric',
      month: 'numeric',
    }).formatToParts(currentDate);
    const year = Number(dateParts.find((part) => part.type === 'year')?.value);
    const month = Number(
      dateParts.find((part) => part.type === 'month')?.value,
    );
    const startYear = month >= ACADEMIC_YEAR_START_MONTH ? year : year - 1;
    const endYear = startYear + 1;

    return {
      name: `${startYear}-${endYear}`,
      startDate: `${startYear}-09-01`,
      endDate: `${endYear}-08-31`,
    };
  }
}
