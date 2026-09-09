import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AccessControlService } from '../access-control/access-control.service';
import { ReceivablesService } from './receivables.service';
import { QueryReceivableDto } from './dto/query-receivable.dto';

@ApiTags('Receivables')
@ApiBearerAuth()
@Controller('receivables')
export class ReceivablesController {
  constructor(
    private readonly service: ReceivablesService,
    private readonly accessControlService: AccessControlService,
  ) {}

  @Get()
  async findAll(
    @Query() query: QueryReceivableDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scopedIds = await this.accessControlService.resolveSchoolFilter(
      user,
      query.schoolId,
    );
    return this.service.findAll(query, scopedIds);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const entity = await this.service.findById(id);
    await this.accessControlService.assertSchoolAccess(user, entity.schoolId);
    return entity;
  }
}
