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
import { Role } from '../common/enums/role.enum';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { QueryCompanyDto } from './dto/query-company.dto';

@ApiTags('Companies')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  constructor(private readonly service: CompaniesService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN)
  create(@Body() dto: CreateCompanyDto) {
    return this.service.create(dto);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN)
  findAll(@Query() query: QueryCompanyDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.softDelete(id);
  }
}
