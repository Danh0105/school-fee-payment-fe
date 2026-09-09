import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PaymentTransactionsService } from './payment-transactions.service';
import { QueryPaymentTransactionDto } from './dto/query-payment-transaction.dto';

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
}
