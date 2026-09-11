import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SemestersService } from './semesters.service';
import { QuerySemesterDto } from './dto/query-semester.dto';

@ApiTags('Semesters')
@ApiBearerAuth()
@Controller('semesters')
export class SemestersController {
  constructor(private readonly service: SemestersService) {}

  @Get()
  findAll(@Query() query: QuerySemesterDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id);
  }
}
