import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ViettelSinvoiceAuthService } from './viettel-sinvoice-auth.service';
import { ViettelSinvoiceHttpService } from './viettel-sinvoice-http.service';
import { ViettelSinvoiceMapper } from './viettel-sinvoice.mapper';
import { ViettelSinvoiceService } from './viettel-sinvoice.service';
import { ViettelSinvoiceTokenStore } from './viettel-sinvoice-token.store';
import { MoneyCalculatorService } from '../../services/money-calculator.service';

@Module({
  imports: [HttpModule],
  providers: [
    ViettelSinvoiceTokenStore,
    ViettelSinvoiceAuthService,
    ViettelSinvoiceHttpService,
    ViettelSinvoiceMapper,
    ViettelSinvoiceService,
    MoneyCalculatorService,
  ],
  exports: [
    ViettelSinvoiceService,
    ViettelSinvoiceMapper,
    MoneyCalculatorService,
  ],
})
export class ViettelSinvoiceModule {}
