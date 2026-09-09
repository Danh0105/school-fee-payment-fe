import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AccessControlService } from '../access-control/access-control.service';
import { StudentsService } from '../students/students.service';
import { StudentCreditsService } from './student-credits.service';

@ApiTags('Students')
@ApiBearerAuth()
@Controller('students/:id/credits')
export class StudentCreditsController {
  constructor(
    private readonly service: StudentCreditsService,
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

    const credits = await this.service.findByStudent(studentId);
    const availableBalance = await this.service.getAvailableBalance(studentId);
    return { credits, availableBalance: availableBalance.toFixed(2) };
  }
}
