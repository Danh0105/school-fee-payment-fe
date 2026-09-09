import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AccessControlService } from '../access-control/access-control.service';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { Class } from '../classes/entities/class.entity';
import { ReportsService } from './reports.service';
import { ReportFilterDto } from './dto/report-filter.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly service: ReportsService,
    private readonly accessControlService: AccessControlService,
    @InjectRepository(Class)
    private readonly classRepo: Repository<Class>,
  ) {}

  @Get('receivables')
  async receivables(
    @Query() filter: ReportFilterDto,
    @Query() pagination: PaginationQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scopedIds = await this.accessControlService.resolveSchoolFilter(
      user,
      filter.schoolId,
    );
    const [summary, rows] = await Promise.all([
      this.service.receivablesReport(filter, scopedIds),
      this.service.listReceivableRows(filter, pagination, scopedIds),
    ]);
    return { summary, ...rows };
  }

  @Get('payments')
  async payments(
    @Query() filter: ReportFilterDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scopedIds = await this.accessControlService.resolveSchoolFilter(
      user,
      filter.schoolId,
    );
    return this.service.paymentsReport(filter, scopedIds);
  }

  @Get('classes/:id')
  async classReport(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const klass = await this.classRepo.findOne({ where: { id } });
    if (!klass) throw AppException.notFound(ErrorCode.CLASS_NOT_FOUND);
    await this.accessControlService.assertSchoolAccess(user, klass.schoolId);
    return this.service.classReport(id);
  }
}
