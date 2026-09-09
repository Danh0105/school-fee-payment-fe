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
import { FeeCategoriesService } from './fee-categories.service';
import { CreateFeeCategoryDto } from './dto/create-fee-category.dto';
import { UpdateFeeCategoryDto } from './dto/update-fee-category.dto';
import { QueryFeeCategoryDto } from './dto/query-fee-category.dto';

@ApiTags('Fee Categories')
@ApiBearerAuth()
@Controller('fee-categories')
export class FeeCategoriesController {
  constructor(
    private readonly service: FeeCategoriesService,
    private readonly accessControlService: AccessControlService,
  ) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async create(
    @Body() dto: CreateFeeCategoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.accessControlService.assertSchoolAccess(user, dto.schoolId);
    return this.service.create(dto);
  }

  @Get()
  async findAll(
    @Query() query: QueryFeeCategoryDto,
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
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFeeCategoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const entity = await this.service.findById(id);
    await this.accessControlService.assertSchoolAccess(user, entity.schoolId);
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const entity = await this.service.findById(id);
    await this.accessControlService.assertSchoolAccess(user, entity.schoolId);
    return this.service.softDelete(id);
  }
}
