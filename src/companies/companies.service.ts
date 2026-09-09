import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Company } from './entities/company.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { QueryCompanyDto } from './dto/query-company.dto';
import { PaginatedResult } from '../common/dto/paginated-result.dto';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company)
    private readonly repo: Repository<Company>,
  ) {}

  async create(dto: CreateCompanyDto): Promise<Company> {
    const existing = await this.repo.findOne({
      where: { code: dto.code, deletedAt: IsNull() },
    });
    if (existing) throw AppException.conflict(ErrorCode.COMPANY_CODE_EXISTS);
    return this.repo.save(this.repo.create(dto));
  }

  async findAll(query: QueryCompanyDto): Promise<PaginatedResult<Company>> {
    const qb = this.repo
      .createQueryBuilder('c')
      .where('c.deletedAt IS NULL')
      .orderBy(`c.${query.sortBy ?? 'createdAt'}`, query.sortOrder ?? 'DESC');
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

  async findById(id: string): Promise<Company> {
    const company = await this.repo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!company) throw AppException.notFound(ErrorCode.COMPANY_NOT_FOUND);
    return company;
  }

  async update(id: string, dto: UpdateCompanyDto): Promise<Company> {
    const company = await this.findById(id);
    if (dto.code && dto.code !== company.code) {
      const existing = await this.repo.findOne({
        where: { code: dto.code, deletedAt: IsNull() },
      });
      if (existing) throw AppException.conflict(ErrorCode.COMPANY_CODE_EXISTS);
    }
    Object.assign(company, dto);
    return this.repo.save(company);
  }

  async softDelete(id: string): Promise<void> {
    const company = await this.findById(id);
    company.deletedAt = new Date();
    await this.repo.save(company);
  }
}
