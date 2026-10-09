export type ViettelHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ViettelEndpointDefinition {
  section: string;
  path: string;
  method?: ViettelHttpMethod;
  contentType: 'application/json' | 'application/x-www-form-urlencoded';
  verificationRequired?: boolean;
}

export const VIETTEL_ENDPOINTS = {
  issue: {
    section: '7.2',
    path: 'InvoiceAPI/InvoiceWS/createInvoice/{supplierTaxCode}',
    method: 'POST',
    contentType: 'application/json',
  },
  representationFile: {
    section: '7.3',
    path: 'InvoiceAPI/InvoiceUtilsWS/getInvoiceRepresentationFile',
    method: 'POST',
    contentType: 'application/json',
  },
  portalFile: {
    section: '7.4',
    path: 'InvoiceAPI/InvoiceUtilsWS/getInvoiceFilePortal',
    method: 'POST',
    contentType: 'application/x-www-form-urlencoded',
  },
  exchangeFile: {
    section: '7.5',
    path: 'InvoiceAPI/InvoiceWS/createExchangeInvoiceFile',
    method: 'POST',
    contentType: 'application/x-www-form-urlencoded',
  },
  search: {
    section: '7.6',
    path: 'InvoiceAPI/InvoiceUtilsWS/getInvoices/{supplierTaxCode}',
    method: 'POST',
    contentType: 'application/json',
  },
  customFields: {
    section: '7.7',
    path: 'InvoiceAPI/InvoiceWS/getCustomFields',
    method: 'GET',
    contentType: 'application/json',
  },
  draft: {
    section: '7.8',
    path: 'InvoiceAPI/InvoiceWS/createOrUpdateInvoiceDraft/{supplierTaxCode}',
    method: 'POST',
    contentType: 'application/json',
  },
  cancel: {
    section: '7.9',
    path: 'InvoiceAPI/InvoiceWS/cancelTransactionInvoice',
    method: 'POST',
    contentType: 'application/x-www-form-urlencoded',
  },
  taxDeclaration: {
    section: '7.10',
    path: 'InvoiceAPI/InvoiceUtilsWS/updateTaxDeclaration/',
    method: 'POST',
    contentType: 'application/json',
  },
  usageRange: {
    section: '7.11',
    path: 'InvoiceAPI/InvoiceUtilsWS/getProvidesStatusUsingInvoice',
    method: 'POST',
    contentType: 'application/json',
  },
  batch: {
    section: '7.12',
    path: 'InvoiceAPI/InvoiceWS/createBatchInvoice/{supplierTaxCode}',
    method: 'POST',
    contentType: 'application/json',
  },
  listByDate: {
    section: '7.13',
    path: 'InvoiceAPI/InvoiceUtilsWS/getListInvoiceDataControl',
    method: 'POST',
    contentType: 'application/json',
  },
  sendMail: {
    section: '7.14',
    path: 'InvoiceAPI/InvoiceUtilsWS/sendHtmlMailProcess',
    method: 'POST',
    contentType: 'application/json',
  },
  getHash: {
    section: '7.15/7.30',
    path: 'InvoiceAPI/InvoiceWS/createInvoiceUsbTokenGetHash/{supplierTaxCode}',
    method: 'POST',
    contentType: 'application/json',
  },
  insertSignature: {
    section: '7.16/7.31',
    path: 'InvoiceAPI/InvoiceWS/createInvoiceUsbTokenInsertSignature',
    method: 'POST',
    contentType: 'application/json',
  },
  convertFont: {
    section: '7.17',
    path: 'InvoiceAPI/InvoiceUtilsWS/convertFont',
    method: 'POST',
    contentType: 'application/json',
  },
  updatePayment: {
    section: '7.18',
    path: 'InvoiceAPI/InvoiceWS/updatePaymentStatus',
    method: 'POST',
    contentType: 'application/x-www-form-urlencoded',
  },
  cancelPayment: {
    section: '7.19',
    path: 'InvoiceAPI/InvoiceWS/cancelPaymentStatus',
    method: 'POST',
    contentType: 'application/x-www-form-urlencoded',
  },
  preview: {
    section: '7.20',
    path: 'InvoiceAPI/InvoiceUtilsWS/createInvoiceDraftPreview/{supplierTaxCode}',
    method: 'POST',
    contentType: 'application/json',
  },
  byTransactionUuid: {
    section: '7.21',
    path: 'InvoiceAPI/InvoiceWS/searchInvoiceByTransactionUuid',
    method: 'POST',
    contentType: 'application/x-www-form-urlencoded',
  },
  reservationCodes: {
    section: '7.22',
    path: 'InvoiceAPI/BotWS/getReservationCode/{taxCode}',
    method: 'POST',
    contentType: 'application/json',
  },
  printStatus: {
    section: '7.23',
    path: 'InvoiceAPI/InvoiceUtilsWS/updateInvoicePrintStatus',
    method: 'PUT',
    contentType: 'application/json',
  },
  qrScan: {
    section: '7.24',
    path: 'InvoiceAPI/InvoiceUtilsWS/updateInvoiceScanQrcode',
    method: 'PUT',
    contentType: 'application/json',
  },
  invoiceUsage: {
    section: '7.25',
    path: 'InvoiceAPI/InvoiceWS/getInvoiceUsage',
    method: 'GET',
    contentType: 'application/json',
  },
  explanation: {
    section: '7.26',
    path: 'InvoiceWS/update-explanation',
    method: 'PUT',
    contentType: 'application/json',
    verificationRequired: true,
  },
  createWithCode: {
    section: '7.27',
    path: 'InvoiceAPI/BotWS/createInvoiceWithCode/{taxCode}',
    contentType: 'application/json',
    verificationRequired: true,
  },
  templates: {
    section: '7.29',
    path: 'InvoiceAPI/InvoiceUtilsWS/getAllInvoiceTemplates',
    contentType: 'application/json',
    verificationRequired: true,
  },
  sendEmailToCustomer: {
    section: '7.33',
    path: 'InvoiceAPI/InvoiceUtilsWS/sendEmailToCustomer',
    method: 'POST',
    contentType: 'application/json',
  },
  fuelDraft: {
    section: '7.34',
    path: 'InvoiceAPI/InvoiceWS/createOrUpdateInvoiceDraftForFuel/{supplierTaxCode}',
    method: 'POST',
    contentType: 'application/json',
  },
  invoicesWithProducts: {
    section: '7.35',
    path: 'InvoiceAPI/InvoiceUtilsWS/getAllInvoices/{supplierTaxCode}',
    contentType: 'application/json',
    verificationRequired: true,
  },
  sendToTaxAuthority: {
    section: '7.36',
    path: 'InvoiceAPI/InvoiceWS/sendInvoiceByTransactionUuid',
    method: 'POST',
    contentType: 'application/x-www-form-urlencoded',
  },
  invoicesWithProductsUtc7: {
    section: '7.37',
    path: 'InvoiceAPI/InvoiceUtilsWS/getInvoicesAll/{supplierTaxCode}',
    contentType: 'application/json',
    verificationRequired: true,
  },
} satisfies Record<string, ViettelEndpointDefinition>;

export const E_INVOICE_QUEUES = {
  ISSUE: 'einvoice-issue',
  RECONCILE: 'einvoice-reconcile',
  DOWNLOAD: 'einvoice-download',
  SEND_EMAIL: 'einvoice-send-email',
} as const;
export const E_INVOICE_JOBS = {
  ISSUE: 'issue-invoice',
  RECONCILE: 'reconcile-invoice',
  DOWNLOAD: 'download-invoice',
  SEND_EMAIL: 'send-invoice-email',
} as const;

export const RECONCILIATION_DELAYS = [30_000, 60_000, 90_000, 180_000, 300_000];
