import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import {
  DashboardFilterDto,
  DashboardSeriesQueryDto,
} from './dto/dashboard-filter.dto';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('summary')
  summary(@Query() filter: DashboardFilterDto) {
    return this.service.summary(filter);
  }

  @Get('revenue-by-day')
  revenueByDay(@Query() filter: DashboardSeriesQueryDto) {
    return this.service.revenueByDay(filter);
  }

  @Get('revenue-by-month')
  revenueByMonth(@Query() filter: DashboardSeriesQueryDto) {
    return this.service.revenueByMonth(filter);
  }

  @Get('by-class')
  byClass(@Query() filter: DashboardFilterDto) {
    return this.service.byClass(filter);
  }

  @Get('by-fee-category')
  byFeeCategory(@Query() filter: DashboardFilterDto) {
    return this.service.byFeeCategory(filter);
  }
}
