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
import { ReconciliationService } from './reconciliation.service';
import { MatchTransactionDto } from './dto/match-transaction.dto';
import { UnmatchTransactionDto } from './dto/unmatch-transaction.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@ApiTags('Reconciliation')
@ApiBearerAuth()
@Controller('reconciliation')
export class ReconciliationController {
  constructor(
    private readonly service: ReconciliationService,
    private readonly paymentTransactionsService: PaymentTransactionsService,
    private readonly accessControlService: AccessControlService,
  ) {}

  @Get('unmatched')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async listUnmatched(
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const scopedIds =
      await this.accessControlService.getAccessibleSchoolIds(user);
    return this.service.listUnmatched(query, scopedIds);
  }

  @Post(':transactionId/match')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async match(
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
    @Body() dto: MatchTransactionDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const transaction =
      await this.paymentTransactionsService.findById(transactionId);
    await this.accessControlService.assertSchoolAccess(
      user,
      transaction.schoolId,
    );
    return this.service.match(transactionId, dto.paymentOrderId, {
      userId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post(':transactionId/unmatch')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async unmatch(
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
    @Body() dto: UnmatchTransactionDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const transaction =
      await this.paymentTransactionsService.findById(transactionId);
    await this.accessControlService.assertSchoolAccess(
      user,
      transaction.schoolId,
    );
    return this.service.unmatch(transactionId, dto.reason, {
      userId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
