import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { SchoolsService } from '../schools/schools.service';
import { ParentAuthService } from './parent-auth.service';
import { ParentLoginDto } from './dto/parent-login.dto';

@ApiTags('Parent Portal')
@Controller('parent-auth')
export class ParentAuthController {
  constructor(
    private readonly service: ParentAuthService,
    private readonly schoolsService: SchoolsService,
  ) {}

  // Lets the pre-login screen render a school picker without exposing
  // student records or any parent credentials.
  @Public()
  @Get('schools')
  async listSchools() {
    return this.schoolsService.findAllPublicSummary();
  }

  @Public()
  @Post('login')
  async login(@Body() dto: ParentLoginDto) {
    return this.service.login(dto);
  }
}
