import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AccessControlService } from '../access-control/access-control.service';
import { AcademicYearsService } from './academic-years.service';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';
import { UpdateAcademicYearDto } from './dto/update-academic-year.dto';
import { QueryAcademicYearDto } from './dto/query-academic-year.dto';

@ApiTags('Academic Years')
@ApiBearerAuth()
@Controller('academic-years')
export class AcademicYearsController {
  constructor(
    private readonly service: AcademicYearsService,
    private readonly accessControlService: AccessControlService,
  ) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async create(
    @Body() dto: CreateAcademicYearDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.accessControlService.assertSchoolAccess(user, dto.schoolId);
    return this.service.create(dto);
  }

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

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const entity = await this.service.findById(id);
    await this.accessControlService.assertSchoolAccess(user, entity.schoolId);
    return entity;
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAcademicYearDto,
    @CurrentUser() user: AuthUser,
  ) {
    const entity = await this.service.findById(id);
    await this.accessControlService.assertSchoolAccess(user, entity.schoolId);
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
