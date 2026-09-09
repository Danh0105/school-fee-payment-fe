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
import { ClassesService } from './classes.service';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { QueryClassDto } from './dto/query-class.dto';
import { StudentClassesService } from '../student-classes/student-classes.service';

@ApiTags('Classes')
@ApiBearerAuth()
@Controller('classes')
export class ClassesController {
  constructor(
    private readonly service: ClassesService,
    private readonly studentClassesService: StudentClassesService,
    private readonly accessControlService: AccessControlService,
  ) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async create(@Body() dto: CreateClassDto, @CurrentUser() user: AuthUser) {
    await this.accessControlService.assertSchoolAccess(user, dto.schoolId);
    return this.service.create(dto);
  }

  @Get()
  async findAll(@Query() query: QueryClassDto, @CurrentUser() user: AuthUser) {
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

  @Get(':id/students')
  async findStudents(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const entity = await this.service.findById(id);
    await this.accessControlService.assertSchoolAccess(user, entity.schoolId);
    return this.studentClassesService.findActiveStudentsByClass(id);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClassDto,
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
