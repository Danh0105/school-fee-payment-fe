import { Module } from '@nestjs/common';
import { VietQrProvider } from './providers/vietqr.provider';
import { ManualBankProvider } from './providers/manual-bank.provider';
import { PaymentProvidersService } from './payment-providers.service';

@Module({
  providers: [VietQrProvider, ManualBankProvider, PaymentProvidersService],
  exports: [PaymentProvidersService],
})
export class PaymentProvidersModule {}
