import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AccessControlService } from '../access-control/access-control.service';
import { ReceivablesService } from '../receivables/receivables.service';
import { DiscountsService } from './discounts.service';
import { CreateDiscountDto } from './dto/create-discount.dto';

@ApiTags('Receivables')
@ApiBearerAuth()
@Controller('receivables/:id/discount')
export class DiscountsController {
  constructor(
    private readonly service: DiscountsService,
    private readonly receivablesService: ReceivablesService,
    private readonly accessControlService: AccessControlService,
  ) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async create(
    @Param('id', ParseUUIDPipe) receivableId: string,
    @Body() dto: CreateDiscountDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const receivable = await this.receivablesService.findById(receivableId);
    await this.accessControlService.assertSchoolAccess(
      user,
      receivable.schoolId,
    );
    return this.service.create(receivableId, dto, {
      userId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get()
  async findAll(
    @Param('id', ParseUUIDPipe) receivableId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const receivable = await this.receivablesService.findById(receivableId);
    await this.accessControlService.assertSchoolAccess(
      user,
      receivable.schoolId,
    );
    return this.service.findByReceivable(receivableId);
  }
}
