import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StudentCreditsService } from './student-credits.service';

@ApiTags('Students')
@ApiBearerAuth()
@Controller('students/:id/credits')
export class StudentCreditsController {
  constructor(private readonly service: StudentCreditsService) {}

  @Get()
  async findByStudent(@Param('id', ParseUUIDPipe) studentId: string) {
    const credits = await this.service.findByStudent(studentId);
    const availableBalance = await this.service.getAvailableBalance(studentId);
    return { credits, availableBalance: availableBalance.toFixed(2) };
  }
}
