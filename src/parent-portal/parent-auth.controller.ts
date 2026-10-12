import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { SchoolsService } from '../schools/schools.service';
import { ParentAuthService } from './parent-auth.service';
import { StudentAccessDto } from './dto/student-access.dto';
import { SearchStudentByNameDto } from './dto/search-student-by-name.dto';
import { VerifyStudentAccessDto } from './dto/verify-student-access.dto';

@ApiTags('Parent Portal')
@Controller('parent-auth')
export class ParentAuthController {
  constructor(
    private readonly service: ParentAuthService,
    private readonly schoolsService: SchoolsService,
  ) {}

  // Lets the pre-login screen render a "chọn trường" dropdown before the
  // identifierCode input — deliberately minimal fields, no auth required.
  @Public()
  @Get('schools')
  async listSchools() {
    return this.schoolsService.findAllPublicSummary();
  }

  @Public()
  @Post('access')
  async access(@Body() dto: StudentAccessDto) {
    return this.service.accessByIdentifierCode(dto);
  }

  @Public()
  @Post('search')
  async search(@Body() dto: SearchStudentByNameDto) {
    return this.service.searchByFullName(dto);
  }

  @Public()
  @Post('verify')
  async verify(@Body() dto: VerifyStudentAccessDto) {
    return this.service.verifyLookup(dto);
  }
}
