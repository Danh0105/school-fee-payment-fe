import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Decimal from 'decimal.js';
import {
  CreateQrInput,
  CreateQrResult,
  ParsedTransaction,
  PaymentProvider,
} from '../payment-provider.interface';
import { PaymentProviderCode } from '../../common/enums/status.enum';
import { CryptoKeyService } from '../../viettinbank/crypto-key.service';
import { ViettinbankApiService } from '../../viettinbank/viettinbank-api.service';
import { toSafeString } from '../../common/utils/stringify.util';

/** yyyyMMddHHmmss -> Date, as sent by VietinBank in transTime. */
function parseVietinbankTime(value: string): Date {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!m) return new Date();
  const [, y, mo, d, h, mi, s] = m;
  return new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s),
  );
}

/**
 * Adapter for VietinBank's own eBank Biz collection API (virtual-account QR
 * + inq-bill/notify-bill callbacks), as opposed to VietQrProvider which
 * targets a generic NAPAS VietQR aggregator. createQr() calls VietinBank
 * directly; verifyWebhook()/parseTransaction() validate and map the
 * notify-bill payload VietinBank posts to ../../viettinbank/viettinbank.controller.ts.
 */
@Injectable()
export class ViettinbankProvider implements PaymentProvider {
  readonly code = PaymentProviderCode.VIETINBANK;

  constructor(
    private readonly config: ConfigService,
    private readonly cryptoKeys: CryptoKeyService,
    private readonly api: ViettinbankApiService,
  ) {}

  createQr(input: CreateQrInput): CreateQrResult {
    // Real generation happens synchronously against VietinBank in
    // PaymentOrdersService via generateQrSync() below — PaymentProvider's
    // createQr() is intentionally synchronous, so this path is unused for
    // VIETINBANK and callers should use ViettinbankProvider.generateQr().
    void input;
    return { qrPayload: null, qrUrl: null };
  }

  async generateQr(
    input: CreateQrInput,
  ): Promise<CreateQrResult & { raw: Record<string, unknown> }> {
    const account = this.config.get<string>('viettinbank.account') ?? '';
    const accountNumber = `${account}${input.transferContent}`;
    const raw = await this.api.generateQr({
      accountNumber,
      amount: input.amount.toNumber(),
      purposeOfTrans: input.transferContent,
    });
    const data = (raw.data ?? {}) as Record<string, unknown>;
    return {
      qrPayload: (data.qrCode as string) ?? null,
      qrUrl: (data.qrUrl as string) ?? null,
      raw,
    };
  }

  verifyWebhook(
    rawBody: Record<string, unknown>,
    _headers: Record<string, string | undefined>,
  ): boolean {
    void _headers;
    const signature = rawBody.signature;
    if (typeof signature !== 'string' || !signature) return false;

    const n = (v: unknown) => (v === null || v === undefined ? '' : String(v));
    const verifyData =
      n(rawBody.transId) +
      n(rawBody.transTime) +
      n(rawBody.custCode) +
      n(rawBody.amount) +
      n(rawBody.bankTransId) +
      n(rawBody.remark);

    return this.cryptoKeys.verify(verifyData, signature);
  }

  parseTransaction(payload: Record<string, unknown>): ParsedTransaction {
    const transId = payload.transId;
    if (!transId) {
      throw new Error('notify-bill payload thiếu trường transId');
    }
    const amountRaw = payload.amount;
    if (amountRaw === undefined || amountRaw === null) {
      throw new Error('notify-bill payload thiếu trường amount');
    }

    return {
      externalTransactionId: toSafeString(transId),
      bankTransactionId: payload.bankTransId
        ? toSafeString(payload.bankTransId)
        : null,
      bankCode: 'ICB',
      bankAccountNumber: payload.recvAcctId
        ? toSafeString(payload.recvAcctId)
        : null,
      amount: new Decimal(amountRaw as string | number),
      transferContent: payload.custCode
        ? toSafeString(payload.custCode).trim()
        : null,
      transactionTime: payload.transTime
        ? parseVietinbankTime(toSafeString(payload.transTime))
        : new Date(),
      direction: 'in',
      rawPayload: payload,
    };
  }
}
