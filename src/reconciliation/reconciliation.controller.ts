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
import { ReconciliationService } from './reconciliation.service';
import { MatchTransactionDto } from './dto/match-transaction.dto';
import { UnmatchTransactionDto } from './dto/unmatch-transaction.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@ApiTags('Reconciliation')
@ApiBearerAuth()
@Controller('reconciliation')
export class ReconciliationController {
  constructor(private readonly service: ReconciliationService) {}

  @Get('unmatched')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  listUnmatched(@Query() query: PaginationQueryDto) {
    return this.service.listUnmatched(query);
  }

  @Post(':transactionId/match')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  match(
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
    @Body() dto: MatchTransactionDto,
    @CurrentUser('id') userId: string,
    @Req() req: Request,
  ) {
    return this.service.match(transactionId, dto.paymentOrderId, {
      userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post(':transactionId/unmatch')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  unmatch(
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
    @Body() dto: UnmatchTransactionDto,
    @CurrentUser('id') userId: string,
    @Req() req: Request,
  ) {
    return this.service.unmatch(transactionId, dto.reason, {
      userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
