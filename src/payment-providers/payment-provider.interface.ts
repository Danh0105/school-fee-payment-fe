import Decimal from 'decimal.js';
import { PaymentProviderCode } from '../common/enums/status.enum';

export interface CreateQrInput {
  bankCode: string;
  bankAccountNumber: string;
  bankAccountName: string;
  amount: Decimal;
  transferContent: string;
}

export interface CreateQrResult {
  qrPayload: string | null;
  qrUrl: string | null;
}

export interface ParsedTransaction {
  externalTransactionId: string;
  bankTransactionId?: string | null;
  bankCode?: string | null;
  bankAccountNumber?: string | null;
  amount: Decimal;
  transferContent: string | null;
  transactionTime: Date;
  /** Money movement direction as reported by the bank/gateway. Only 'in' should be posted as a PaymentTransaction. */
  direction: 'in' | 'out';
  rawPayload: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly code: PaymentProviderCode;
  createQr(input: CreateQrInput): CreateQrResult;
  verifyWebhook(
    rawBody: Record<string, unknown>,
    headers: Record<string, string | undefined>,
  ): boolean;
  parseTransaction(payload: Record<string, unknown>): ParsedTransaction;
}

export const PAYMENT_PROVIDER_REGISTRY = 'PAYMENT_PROVIDER_REGISTRY';
