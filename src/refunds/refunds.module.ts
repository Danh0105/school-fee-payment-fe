import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Refund } from './entities/refund.entity';
import { RefundsService } from './refunds.service';
import { RefundsController } from './refunds.controller';
import { LedgerModule } from '../ledger/ledger.module';
import { PaymentTransactionsModule } from '../payment-transactions/payment-transactions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Refund]),
    LedgerModule,
    PaymentTransactionsModule,
  ],
  providers: [RefundsService],
  controllers: [RefundsController],
  exports: [RefundsService],
})
export class RefundsModule {}
