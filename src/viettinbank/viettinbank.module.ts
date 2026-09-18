import { Module } from '@nestjs/common';
import { CryptoKeyService } from './crypto-key.service';
import { ViettinbankApiService } from './viettinbank-api.service';

/**
 * Self-contained VietinBank protocol layer: RSA key handling and the
 * generate-QR API client. No dependency on any domain entity, so this
 * module can be copied into another NestJS backend as-is — only the
 * VIETINBANK_* env vars (see .env.example) and the payment-providers
 * adapter that consumes it need to be wired up on the target side.
 */
@Module({
  providers: [CryptoKeyService, ViettinbankApiService],
  exports: [CryptoKeyService, ViettinbankApiService],
})
export class ViettinbankModule {}
