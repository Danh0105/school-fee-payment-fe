import { Injectable } from '@nestjs/common';
import { PaymentProvider } from './payment-provider.interface';
import { VietQrProvider } from './providers/vietqr.provider';
import { ManualBankProvider } from './providers/manual-bank.provider';
import { ViettinbankProvider } from './providers/viettinbank.provider';
import { PaymentProviderCode } from '../common/enums/status.enum';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';

@Injectable()
export class PaymentProvidersService {
  private readonly providers: Map<PaymentProviderCode, PaymentProvider>;

  constructor(
    vietQrProvider: VietQrProvider,
    manualBankProvider: ManualBankProvider,
    viettinbankProvider: ViettinbankProvider,
  ) {
    this.providers = new Map<PaymentProviderCode, PaymentProvider>([
      [PaymentProviderCode.VIETQR, vietQrProvider],
      [PaymentProviderCode.MANUAL_BANK, manualBankProvider],
      [PaymentProviderCode.VIETINBANK, viettinbankProvider],
    ]);
  }

  get(code: PaymentProviderCode | string): PaymentProvider {
    const provider = this.providers.get(code as PaymentProviderCode);
    if (!provider) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_ERROR,
        `Payment provider "${code}" không được hỗ trợ`,
      );
    }
    return provider;
  }
}
