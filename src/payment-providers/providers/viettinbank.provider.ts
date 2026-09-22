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
import { buildVietQrImageUrl } from '../../common/utils/vietqr.util';

/** NAPAS bank BIN for VietinBank, used only to render a scannable QR image via img.vietqr.io. */
const VIETINBANK_BIN = '970415';

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

    // The bank's own response only carries a base64-encoded EMV/VietQR
    // string (doc §2.1: "data.base64QRCode ... đối tác nhận được mã base64
    // này thì decode ra string và dùng thư viện tạo ra mã qr dạng ảnh"), not
    // a ready-to-render image URL. Decode it for qrPayload, and build a
    // renderable image URL the same way VietQrProvider does — via
    // img.vietqr.io keyed by bank BIN + account, which VietinBank's own
    // virtual account also satisfies (both are standard NAPAS VietQR).
    const base64QrCode = data.base64QRCode as string | undefined;
    const qrPayload = base64QrCode
      ? Buffer.from(base64QrCode, 'base64').toString('utf8')
      : null;
    const qrUrl = qrPayload
      ? buildVietQrImageUrl({
          bankBin: VIETINBANK_BIN,
          accountNumber,
          amount: input.amount.toFixed(0),
          addInfo: input.transferContent,
          merchantName: input.bankAccountName,
        })
      : null;

    return { qrPayload, qrUrl, raw };
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
        ? this.stripVac(toSafeString(payload.custCode).trim())
        : null,
      transactionTime: payload.transTime
        ? parseVietinbankTime(toSafeString(payload.transTime))
        : new Date(),
      direction: 'in',
      rawPayload: payload,
    };
  }

  /**
   * custCode from VietinBank is VAC + VAV (see doc §2.2.2: "Cấu trúc: VAC +
   * VAV") — VAC is our fixed virtual-account prefix (config
   * viettinbank.account), VAV is the order's own transferContent. Strip the
   * VAC prefix so lookups match PaymentOrder.transferContent, which stores
   * VAV only (see generateQr() building accountNumber = account +
   * transferContent).
   */
  private stripVac(custCode: string): string {
    const vac = this.config.get<string>('viettinbank.account') ?? '';
    return vac && custCode.startsWith(vac)
      ? custCode.slice(vac.length)
      : custCode;
  }
}
