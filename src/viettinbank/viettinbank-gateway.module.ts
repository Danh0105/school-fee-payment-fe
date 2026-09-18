import { Module } from '@nestjs/common';
import { ViettinbankModule } from './viettinbank.module';
import { ViettinbankController } from './viettinbank.controller';
import { PaymentOrdersModule } from '../payment-orders/payment-orders.module';
import { PaymentTransactionsModule } from '../payment-transactions/payment-transactions.module';

/**
 * Wires the bank-facing VietinBank controller (inq-bill/notify-bill) to
 * this app's own PaymentOrder/PaymentTransaction services. Kept separate
 * from ViettinbankModule (which PaymentProvidersModule also depends on) to
 * avoid a module import cycle, since both PaymentOrdersModule and
 * PaymentTransactionsModule depend on PaymentProvidersModule.
 */
@Module({
  imports: [ViettinbankModule, PaymentOrdersModule, PaymentTransactionsModule],
  controllers: [ViettinbankController],
})
export class ViettinbankGatewayModule {}
