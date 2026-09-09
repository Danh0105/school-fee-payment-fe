import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { PaymentProviderCode } from '../common/enums/status.enum';
import { PaymentTransactionsService } from './payment-transactions.service';

/**
 * Public gateway webhooks only. Providers accepted here MUST perform real
 * cryptographic verification in their verifyWebhook() (VIETQR does, via
 * HMAC signature) — anything without that (e.g. MANUAL_BANK, whose
 * verifyWebhook() always returns true because it's meant to be called by an
 * authenticated accountant/cashier, not the public internet) is rejected at
 * this route and must go through PaymentTransactionsController's
 * authenticated /payment-transactions/manual endpoint instead.
 */
const PUBLIC_WEBHOOK_PROVIDERS = new Set<string>([PaymentProviderCode.VIETQR]);

@ApiExcludeController()
@Controller('webhooks/payment')
export class WebhooksController {
  constructor(private readonly service: PaymentTransactionsService) {}

  @Public()
  @Post(':provider')
  async handle(
    @Param('provider') provider: string,
    @Body() body: Record<string, unknown>,
    @Headers() headers: Record<string, string | undefined>,
  ) {
    if (!PUBLIC_WEBHOOK_PROVIDERS.has(provider)) {
      throw AppException.forbidden(
        ErrorCode.FORBIDDEN,
        `Provider "${provider}" không được phép gọi qua webhook công khai`,
      );
    }
    const result = await this.service.ingest(provider, body, headers);
    return { received: true, ...result };
  }
}
