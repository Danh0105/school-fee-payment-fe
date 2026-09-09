import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { ReportFilterDto } from './dto/report-filter.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('receivables')
  async receivables(
    @Query() filter: ReportFilterDto,
    @Query() pagination: PaginationQueryDto,
  ) {
    const [summary, rows] = await Promise.all([
      this.service.receivablesReport(filter),
      this.service.listReceivableRows(filter, pagination),
    ]);
    return { summary, ...rows };
  }

  @Get('payments')
  payments(@Query() filter: ReportFilterDto) {
    return this.service.paymentsReport(filter);
  }

  @Get('classes/:id')
  classReport(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.classReport(id);
  }
}
