import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { PaymentTransactionsService } from './payment-transactions.service';
import { PaymentTransactionsController } from './payment-transactions.controller';
import { WebhooksController } from './webhooks.controller';
import { PaymentProvidersModule } from '../payment-providers/payment-providers.module';
import { PaymentAllocationsModule } from '../payment-allocations/payment-allocations.module';
import { SchoolsModule } from '../schools/schools.module';
import { PaymentOrder } from '../payment-orders/entities/payment-order.entity';
import { BankReconciliation } from '../reconciliation/entities/bank-reconciliation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentTransaction,
      PaymentOrder,
      BankReconciliation,
    ]),
    PaymentProvidersModule,
    PaymentAllocationsModule,
    SchoolsModule,
  ],
  providers: [PaymentTransactionsService],
  controllers: [PaymentTransactionsController, WebhooksController],
  exports: [PaymentTransactionsService],
})
export class PaymentTransactionsModule {}
