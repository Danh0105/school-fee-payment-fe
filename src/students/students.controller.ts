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
  constructor(private readonly service: StudentsService) {}

  private applyMasking(student: Student, role: Role): Student {
    if (!FULL_IDENTIFIER_ROLES.includes(role)) {
      student.identifierCode = maskIdentifierCode(student.identifierCode);
    }
    return student;
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  create(@Body() dto: CreateStudentDto) {
    return this.service.create(dto);
  }

  @Get()
  async findAll(
    @Query() query: QueryStudentDto,
    @CurrentUser('role') role: Role,
  ): Promise<PaginatedResult<Student>> {
    const result = await this.service.findAll(query);
    result.data = result.data.map((s) => this.applyMasking(s, role));
    return result;
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('role') role: Role,
  ) {
    const student = await this.service.findById(id);
    return this.applyMasking(student, role);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.softDelete(id);
  }
}
