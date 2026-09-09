import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AccessControlService } from '../access-control/access-control.service';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { PaymentOrder } from '../payment-orders/entities/payment-order.entity';
import { PaymentTransactionsService } from './payment-transactions.service';
import { QueryPaymentTransactionDto } from './dto/query-payment-transaction.dto';
import { RecordManualTransactionDto } from './dto/record-manual-transaction.dto';
import { PaymentProviderCode } from '../common/enums/status.enum';

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payment-transactions')
export class PaymentTransactionsController {
  constructor(
    private readonly service: PaymentTransactionsService,
    private readonly accessControlService: AccessControlService,
    @InjectRepository(PaymentOrder)
    private readonly paymentOrderRepo: Repository<PaymentOrder>,
  ) {}

  @Get()
  async findAll(
    @Query() query: QueryPaymentTransactionDto,
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
    const transaction = await this.service.findById(id);
    await this.accessControlService.assertSchoolAccess(
      user,
      transaction.schoolId,
    );
    return transaction;
  }

  /**
   * Authenticated entry point for cash/manual bank payments a cashier or
   * accountant records by hand. Unlike the public webhook route, this is
   * gated by JWT + role rather than a cryptographic signature — the caller's
   * identity IS the verification. The target order's school is checked
   * BEFORE ingesting, so an out-of-scope attempt never creates a transaction.
   */
  @Post('manual')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT, Role.CASHIER)
  async recordManual(
    @Body() dto: RecordManualTransactionDto,
    @CurrentUser() user: AuthUser,
  ) {
    const order = await this.paymentOrderRepo.findOne({
      where: { transferContent: dto.transferContent.trim() },
    });
    if (!order) throw AppException.notFound(ErrorCode.PAYMENT_ORDER_NOT_FOUND);
    await this.accessControlService.assertSchoolAccess(user, order.schoolId);

    const result = await this.service.ingest(
      PaymentProviderCode.MANUAL_BANK,
      {
        externalTransactionId: dto.externalTransactionId,
        amount: dto.amount,
        transferContent: dto.transferContent,
        bankCode: dto.bankCode,
        bankAccountNumber: dto.bankAccountNumber,
        transactionTime: dto.transactionTime,
      },
      {},
      user.id,
    );
    return result;
  }
}
