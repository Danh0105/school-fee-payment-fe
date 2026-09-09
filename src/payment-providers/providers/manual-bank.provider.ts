import { Injectable } from '@nestjs/common';
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
 * Static bank-transfer instructions (no live gateway). Transactions are
 * entered by an accountant via an authenticated endpoint rather than a
 * public webhook, so verifyWebhook always passes here — the route itself
 * is protected by JWT + role guards.
 */
@Injectable()
export class ManualBankProvider implements PaymentProvider {
  readonly code = PaymentProviderCode.MANUAL_BANK;

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

  verifyWebhook(): boolean {
    return true;
  }

  parseTransaction(payload: Record<string, unknown>): ParsedTransaction {
    const id = payload.externalTransactionId ?? payload.id;
    if (id === undefined || id === null) {
      throw new Error(
        'Thiếu externalTransactionId cho giao dịch nhập thủ công',
      );
    }
    const amountRaw = payload.amount;
    if (amountRaw === undefined || amountRaw === null) {
      throw new Error('Thiếu amount cho giao dịch nhập thủ công');
    }

    return {
      externalTransactionId: toSafeString(id),
      bankTransactionId: payload.bankTransactionId
        ? toSafeString(payload.bankTransactionId)
        : null,
      bankCode: payload.bankCode ? toSafeString(payload.bankCode) : null,
      bankAccountNumber: payload.bankAccountNumber
        ? toSafeString(payload.bankAccountNumber)
        : null,
      amount: new Decimal(amountRaw as string | number),
      transferContent: payload.transferContent
        ? toSafeString(payload.transferContent).trim()
        : null,
      transactionTime: payload.transactionTime
        ? new Date(toSafeString(payload.transactionTime))
        : new Date(),
      direction: 'in',
      rawPayload: payload,
    };
  }
}
