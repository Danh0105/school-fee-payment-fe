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
import { SchoolsService } from './schools.service';
import { CreateSchoolDto } from './dto/create-school.dto';
import { UpdateSchoolDto } from './dto/update-school.dto';
import { QuerySchoolDto } from './dto/query-school.dto';

@ApiTags('Schools')
@ApiBearerAuth()
@Controller('schools')
export class SchoolsController {
  constructor(
    private readonly schoolsService: SchoolsService,
    private readonly accessControlService: AccessControlService,
  ) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  create(@Body() dto: CreateSchoolDto) {
    return this.schoolsService.create(dto);
  }

  @Get()
  async findAll(@Query() query: QuerySchoolDto, @CurrentUser() user: AuthUser) {
    const scopedIds =
      await this.accessControlService.getAccessibleSchoolIds(user);
    return this.schoolsService.findAll(query, scopedIds);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.accessControlService.assertSchoolAccess(user, id);
    return this.schoolsService.findById(id);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSchoolDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.accessControlService.assertSchoolAccess(user, id);
    return this.schoolsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.schoolsService.softDelete(id);
  }
}
