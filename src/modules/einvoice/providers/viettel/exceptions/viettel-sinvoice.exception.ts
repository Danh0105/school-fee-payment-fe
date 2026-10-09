export type ViettelErrorKind =
  | 'AUTH_ERROR'
  | 'VALIDATION_ERROR'
  | 'DUPLICATE_TRANSACTION'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'VIETTEL_5XX'
  | 'INVOICE_NOT_READY'
  | 'UNKNOWN';

export class ViettelSinvoiceException extends Error {
  readonly createdAt = new Date();

  constructor(
    readonly kind: ViettelErrorKind,
    readonly httpStatus: number | null,
    readonly viettelCode: string | null,
    readonly viettelMessage: string,
    readonly endpoint: string,
    readonly transactionUuid: string | null,
    readonly retryable: boolean,
  ) {
    super(`Viettel S-Invoice ${kind}: ${viettelCode ?? 'UNKNOWN'}`);
    this.name = ViettelSinvoiceException.name;
  }
}
