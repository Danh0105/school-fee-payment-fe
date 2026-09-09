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
import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { QueryStudentDto } from './dto/query-student.dto';
import { Student } from './entities/student.entity';
import { PaginatedResult } from '../common/dto/paginated-result.dto';
import { maskIdentifierCode } from '../common/utils/mask.util';

const FULL_IDENTIFIER_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT];

@ApiTags('Students')
@ApiBearerAuth()
@Controller('students')
export class StudentsController {
  constructor(
    private readonly service: StudentsService,
    private readonly accessControlService: AccessControlService,
  ) {}

  private applyMasking(student: Student, role: Role): Student {
    if (!FULL_IDENTIFIER_ROLES.includes(role)) {
      student.identifierCode = maskIdentifierCode(student.identifierCode);
    }
    return student;
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async create(@Body() dto: CreateStudentDto, @CurrentUser() user: AuthUser) {
    await this.accessControlService.assertSchoolAccess(user, dto.schoolId);
    return this.service.create(dto);
  }

  @Get()
  async findAll(
    @Query() query: QueryStudentDto,
    @CurrentUser() user: AuthUser,
  ): Promise<PaginatedResult<Student>> {
    const scopedIds = await this.accessControlService.resolveSchoolFilter(
      user,
      query.schoolId,
    );
    const result = await this.service.findAll(query, scopedIds);
    result.data = result.data.map((s) => this.applyMasking(s, user.role));
    return result;
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const student = await this.service.findById(id);
    await this.accessControlService.assertSchoolAccess(user, student.schoolId);
    return this.applyMasking(student, user.role);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentDto,
    @CurrentUser() user: AuthUser,
  ) {
    const student = await this.service.findById(id);
    await this.accessControlService.assertSchoolAccess(user, student.schoolId);
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const student = await this.service.findById(id);
    await this.accessControlService.assertSchoolAccess(user, student.schoolId);
    return this.service.softDelete(id);
  }
}
