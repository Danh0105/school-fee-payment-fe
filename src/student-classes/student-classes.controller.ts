import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { StudentClassesService } from './student-classes.service';
import { AssignStudentClassDto } from './dto/assign-student-class.dto';

@ApiTags('Classes')
@ApiBearerAuth()
@Controller('student-classes')
export class StudentClassesController {
  constructor(private readonly service: StudentClassesService) {}

  @Post('assign')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  assign(@Body() dto: AssignStudentClassDto) {
    return this.service.assign(dto);
  }
}
