export interface ViettelEnvelope<T> {
  errorCode?: string | null;
  description?: string | null;
  code?: string | number | null;
  message?: string | null;
  data?: T;
  result?: T;
}

export interface ViettelIssueResult {
  supplierTaxCode: string;
  invoiceNo: string;
  transactionID: string;
  reservationCode?: string | null;
  codeOfTax?: string | null;
}

export interface ViettelInvoiceFileResult {
  fileName: string;
  fileToBytes: string | number[];
  paymentStatus?: string;
}

export interface ViettelTransactionSearchResult {
  invoiceNo: string;
  reservationCode?: string | null;
  issueDate?: string | number | null;
  status?: string | number | null;
  exchangeStatus?: string | number | null;
  exchangeDes?: string | null;
  codeOfTax?: string | null;
  transactionID?: string | null;
  /** Set by the provider: Viettel holds a record for the uuid, numbered or not. */
  exists?: boolean;
}
