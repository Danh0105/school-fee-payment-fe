import {
  CancelInvoiceDto,
  InvoiceFileRequestDto,
  PaymentStatusDto,
  SendEmailToCustomerDto,
} from './viettel/dto/api.dto';
import { ViettelInvoicePayloadDto } from './viettel/dto/invoice-payload.dto';
import {
  ViettelInvoiceFileResult,
  ViettelIssueResult,
  ViettelTransactionSearchResult,
} from './viettel/responses/viettel.responses';

export const E_INVOICE_PROVIDER = Symbol('E_INVOICE_PROVIDER');

export interface EInvoiceProvider {
  issueInvoice(
    data: ViettelInvoicePayloadDto,
    supplierTaxCode: string,
  ): Promise<ViettelIssueResult>;
  replaceInvoice(
    data: ViettelInvoicePayloadDto,
    supplierTaxCode: string,
  ): Promise<ViettelIssueResult>;
  adjustInvoice(
    data: ViettelInvoicePayloadDto,
    supplierTaxCode: string,
  ): Promise<ViettelIssueResult>;
  createOrUpdateInvoiceDraft(
    data: ViettelInvoicePayloadDto,
    supplierTaxCode: string,
  ): Promise<Partial<ViettelIssueResult>>;
  getInvoiceByTransactionUuid(
    supplierTaxCode: string,
    uuid: string,
  ): Promise<ViettelTransactionSearchResult>;
  getInvoiceFile(
    data: InvoiceFileRequestDto,
  ): Promise<ViettelInvoiceFileResult>;
  cancelInvoice(data: CancelInvoiceDto): Promise<unknown>;
  sendInvoiceEmail(data: SendEmailToCustomerDto): Promise<unknown>;
  updatePaymentStatus(data: PaymentStatusDto): Promise<unknown>;
}
