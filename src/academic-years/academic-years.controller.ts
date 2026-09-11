import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AccessControlService } from '../access-control/access-control.service';
import { AcademicYearsService } from './academic-years.service';
import { QueryAcademicYearDto } from './dto/query-academic-year.dto';
import { CurrentAcademicYearDto } from './dto/current-academic-year.dto';

@ApiTags('Academic Years')
@ApiBearerAuth()
@Controller('academic-years')
export class AcademicYearsController {
  constructor(
    private readonly service: AcademicYearsService,
    private readonly accessControlService: AccessControlService,
  ) {}

  @Get()
  async findAll(
    @Query() query: QueryAcademicYearDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scopedIds = await this.accessControlService.resolveSchoolFilter(
      user,
      query.schoolId,
    );
    return this.service.findAll(query, scopedIds);
  }

  @Get('current')
  async findCurrent(
    @Query() query: CurrentAcademicYearDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.accessControlService.assertSchoolAccess(user, query.schoolId);
    return this.service.getCurrent(query.schoolId);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const entity = await this.service.findById(id);
    await this.accessControlService.assertSchoolAccess(user, entity.schoolId);
    return entity;
  }
}
