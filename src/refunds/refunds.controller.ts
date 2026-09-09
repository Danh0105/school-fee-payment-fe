import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AccessControlService } from '../access-control/access-control.service';
import { PaymentTransactionsService } from '../payment-transactions/payment-transactions.service';
import { RefundsService } from './refunds.service';
import { CreateRefundDto } from './dto/create-refund.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@ApiTags('Refunds')
@ApiBearerAuth()
@Controller('refunds')
export class RefundsController {
  constructor(
    private readonly service: RefundsService,
    private readonly paymentTransactionsService: PaymentTransactionsService,
    private readonly accessControlService: AccessControlService,
  ) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async create(
    @Body() dto: CreateRefundDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const transaction = await this.paymentTransactionsService.findById(
      dto.paymentTransactionId,
    );
    await this.accessControlService.assertSchoolAccess(
      user,
      transaction.schoolId,
    );
    return this.service.create(dto, {
      userId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get()
  async findAll(
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scopedIds =
      await this.accessControlService.getAccessibleSchoolIds(user);
    return this.service.findAll(query, scopedIds);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const refund = await this.service.findById(id);
    await this.accessControlService.assertSchoolAccess(
      user,
      refund.paymentTransaction.schoolId,
    );
    return refund;
  }
}
