import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import Decimal from 'decimal.js';
import {
  CreateQrInput,
  CreateQrResult,
  ParsedTransaction,
  PaymentProvider,
} from '../payment-provider.interface';
import { PaymentProviderCode } from '../../common/enums/status.enum';
import {
  buildVietQrImageUrl,
  buildVietQrPayload,
} from '../../common/utils/vietqr.util';
import { toSafeString } from '../../common/utils/stringify.util';

/**
 * Adapter for a NAPAS VietQR-compatible gateway/aggregator (Casso, Sepay,
 * PayOS-style bank webhooks all share this general shape: an "in/out"
 * transfer record with amount, content and a unique id).
 */
@Injectable()
export class VietQrProvider implements PaymentProvider {
  readonly code = PaymentProviderCode.VIETQR;

  constructor(private readonly config: ConfigService) {}

  createQr(input: CreateQrInput): CreateQrResult {
    const amount = input.amount.toFixed(0);
    const payloadInput = {
      bankBin: input.bankCode,
      accountNumber: input.bankAccountNumber,
      amount,
      addInfo: input.transferContent,
      merchantName: input.bankAccountName,
    };
    return {
      qrPayload: buildVietQrPayload(payloadInput),
      qrUrl: buildVietQrImageUrl(payloadInput),
    };
  }

  verifyWebhook(
    rawBody: Record<string, unknown>,
    headers: Record<string, string | undefined>,
  ): boolean {
    const secret = this.config.get<string>('payment.webhookSecret');
    if (!secret) return true;

    const signature = headers['x-webhook-signature'];
    if (!signature) return false;

    const expected = createHmac('sha256', secret)
      .update(JSON.stringify(rawBody))
      .digest('hex');
    const expectedBuf = Buffer.from(expected);
    const signatureBuf = Buffer.from(signature);
    if (expectedBuf.length !== signatureBuf.length) return false;
    return timingSafeEqual(expectedBuf, signatureBuf);
  }

  parseTransaction(payload: Record<string, unknown>): ParsedTransaction {
    const id = payload.id ?? payload.referenceCode;
    if (id === undefined || id === null) {
      throw new Error('Webhook payload thiếu trường định danh giao dịch (id)');
    }
    const amountRaw = payload.transferAmount ?? payload.amount;
    if (amountRaw === undefined || amountRaw === null) {
      throw new Error('Webhook payload thiếu trường số tiền (transferAmount)');
    }

    return {
      externalTransactionId: toSafeString(id),
      bankTransactionId: payload.referenceCode
        ? toSafeString(payload.referenceCode)
        : null,
      bankCode: payload.gateway ? toSafeString(payload.gateway) : null,
      bankAccountNumber: payload.accountNumber
        ? toSafeString(payload.accountNumber)
        : null,
      amount: new Decimal(amountRaw as string | number),
      transferContent: payload.content
        ? toSafeString(payload.content).trim()
        : null,
      transactionTime: payload.transactionDate
        ? new Date(toSafeString(payload.transactionDate))
        : new Date(),
      direction: payload.transferType === 'out' ? 'out' : 'in',
      rawPayload: payload,
    };
  }
}
