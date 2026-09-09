import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AccessControlService } from '../access-control/access-control.service';
import { DashboardService } from './dashboard.service';
import {
  DashboardFilterDto,
  DashboardSeriesQueryDto,
} from './dto/dashboard-filter.dto';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly service: DashboardService,
    private readonly accessControlService: AccessControlService,
  ) {}

  @Get('summary')
  async summary(
    @Query() filter: DashboardFilterDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scopedIds = await this.accessControlService.resolveSchoolFilter(
      user,
      filter.schoolId,
    );
    return this.service.summary(filter, scopedIds);
  }

  @Get('revenue-by-day')
  async revenueByDay(
    @Query() filter: DashboardSeriesQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scopedIds = await this.accessControlService.resolveSchoolFilter(
      user,
      filter.schoolId,
    );
    return this.service.revenueByDay(filter, scopedIds);
  }

  @Get('revenue-by-month')
  async revenueByMonth(
    @Query() filter: DashboardSeriesQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scopedIds = await this.accessControlService.resolveSchoolFilter(
      user,
      filter.schoolId,
    );
    return this.service.revenueByMonth(filter, scopedIds);
  }

  @Get('by-class')
  async byClass(
    @Query() filter: DashboardFilterDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scopedIds = await this.accessControlService.resolveSchoolFilter(
      user,
      filter.schoolId,
    );
    return this.service.byClass(filter, scopedIds);
  }

  @Get('by-fee-category')
  async byFeeCategory(
    @Query() filter: DashboardFilterDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scopedIds = await this.accessControlService.resolveSchoolFilter(
      user,
      filter.schoolId,
    );
    return this.service.byFeeCategory(filter, scopedIds);
  }
}
