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
import { FeePlansService } from './fee-plans.service';
import { CreateFeePlanDto } from './dto/create-fee-plan.dto';
import { UpdateFeePlanDto } from './dto/update-fee-plan.dto';
import { QueryFeePlanDto } from './dto/query-fee-plan.dto';

@ApiTags('Fee Plans')
@ApiBearerAuth()
@Controller('fee-plans')
export class FeePlansController {
  constructor(
    private readonly service: FeePlansService,
    private readonly accessControlService: AccessControlService,
  ) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async create(@Body() dto: CreateFeePlanDto, @CurrentUser() user: AuthUser) {
    await this.accessControlService.assertSchoolAccess(user, dto.schoolId);
    return this.service.create(dto, user.id);
  }

  @Get()
  async findAll(
    @Query() query: QueryFeePlanDto,
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
    @Body() dto: UpdateFeePlanDto,
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
    return this.service.remove(id);
  }
}
