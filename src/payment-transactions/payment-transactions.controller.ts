import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { PaymentTransactionsService } from './payment-transactions.service';
import { QueryPaymentTransactionDto } from './dto/query-payment-transaction.dto';
import { RecordManualTransactionDto } from './dto/record-manual-transaction.dto';
import { PaymentProviderCode } from '../common/enums/status.enum';

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payment-transactions')
export class PaymentTransactionsController {
  constructor(private readonly service: PaymentTransactionsService) {}

  @Get()
  findAll(@Query() query: QueryPaymentTransactionDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id);
  }

  /**
   * Authenticated entry point for cash/manual bank payments a cashier or
   * accountant records by hand. Unlike the public webhook route, this is
   * gated by JWT + role rather than a cryptographic signature — the caller's
   * identity IS the verification.
   */
  @Post('manual')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT, Role.CASHIER)
  async recordManual(
    @Body() dto: RecordManualTransactionDto,
    @CurrentUser('id') userId: string,
  ) {
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
      userId,
    );
    return result;
  }
}
