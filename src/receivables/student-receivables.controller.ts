import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AccessControlService } from '../access-control/access-control.service';
import { StudentsService } from '../students/students.service';
import { ReceivablesService } from './receivables.service';

@ApiTags('Students')
@ApiBearerAuth()
@Controller('students/:id/receivables')
export class StudentReceivablesController {
  constructor(
    private readonly service: ReceivablesService,
    private readonly studentsService: StudentsService,
    private readonly accessControlService: AccessControlService,
  ) {}

  @Get()
  async findByStudent(
    @Param('id', ParseUUIDPipe) studentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const student = await this.studentsService.findById(studentId);
    await this.accessControlService.assertSchoolAccess(user, student.schoolId);
    return this.service.findByStudent(studentId);
  }
}
