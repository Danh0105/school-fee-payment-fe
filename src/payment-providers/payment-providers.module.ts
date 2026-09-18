import { Module } from '@nestjs/common';
import { VietQrProvider } from './providers/vietqr.provider';
import { ManualBankProvider } from './providers/manual-bank.provider';
import { ViettinbankProvider } from './providers/viettinbank.provider';
import { PaymentProvidersService } from './payment-providers.service';
import { ViettinbankModule } from '../viettinbank/viettinbank.module';

@Module({
  imports: [ViettinbankModule],
  providers: [
    VietQrProvider,
    ManualBankProvider,
    ViettinbankProvider,
    PaymentProvidersService,
  ],
  exports: [PaymentProvidersService, ViettinbankProvider],
})
export class PaymentProvidersModule {}
