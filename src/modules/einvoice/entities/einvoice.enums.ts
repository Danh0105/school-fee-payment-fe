export enum EInvoiceStatus {
  PENDING = 'PENDING',
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  /** 7.8 draft on the Viettel portal, waiting for the accountant to sign it there. */
  DRAFT = 'DRAFT',
  WAITING_INVOICE_NUMBER = 'WAITING_INVOICE_NUMBER',
  ISSUED = 'ISSUED',
  FILE_PENDING = 'FILE_PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  ADJUSTED = 'ADJUSTED',
  REPLACED = 'REPLACED',
}

/** What a matched payment produces at Viettel: a draft (7.8) or an issued invoice (7.2). */
export enum EInvoiceIssueMode {
  DRAFT = 'DRAFT',
  ISSUE = 'ISSUE',
}

export enum EInvoiceAttemptOperation {
  ISSUE = 'ISSUE',
  RECONCILE = 'RECONCILE',
  DOWNLOAD = 'DOWNLOAD',
  SEND_EMAIL = 'SEND_EMAIL',
  CANCEL = 'CANCEL',
  UPDATE_PAYMENT = 'UPDATE_PAYMENT',
}

export enum EInvoiceAttemptStatus {
  STARTED = 'STARTED',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
}
