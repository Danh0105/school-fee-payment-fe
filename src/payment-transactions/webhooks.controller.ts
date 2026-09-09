import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PaymentTransactionsService } from './payment-transactions.service';

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
    const result = await this.service.ingest(provider, body, headers);
    return { received: true, ...result };
  }
}
