import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AccessControlService } from '../access-control/access-control.service';
import { ReceiptsService } from './receipts.service';
import { QueryReceiptDto } from './dto/query-receipt.dto';
import { CancelReceiptDto } from './dto/cancel-receipt.dto';

@ApiTags('Receipts')
@ApiBearerAuth()
@Controller('receipts')
export class ReceiptsController {
  constructor(
    private readonly service: ReceiptsService,
    private readonly accessControlService: AccessControlService,
  ) {}

  @Get()
  async findAll(
    @Query() query: QueryReceiptDto,
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
    const receipt = await this.service.findById(id);
    await this.accessControlService.assertSchoolAccess(user, receipt.schoolId);
    return receipt;
  }

  @Patch(':id/cancel')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelReceiptDto,
    @CurrentUser() user: AuthUser,
  ) {
    const receipt = await this.service.findById(id);
    await this.accessControlService.assertSchoolAccess(user, receipt.schoolId);
    return this.service.cancel(id, dto.reason, { userId: user.id });
  }
}
