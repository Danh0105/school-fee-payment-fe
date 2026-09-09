import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReceivablesService } from './receivables.service';

@ApiTags('Students')
@ApiBearerAuth()
@Controller('students/:id/receivables')
export class StudentReceivablesController {
  constructor(private readonly service: ReceivablesService) {}

  @Get()
  findByStudent(@Param('id', ParseUUIDPipe) studentId: string) {
    return this.service.findByStudent(studentId);
  }
}
