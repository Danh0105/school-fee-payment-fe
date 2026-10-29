import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EInvoiceProvider } from '../einvoice-provider.interface';
import {
  CancelInvoiceDto,
  ConvertFontDto,
  DateRangeDto,
  ExchangeFileRequestDto,
  InvoiceExplanationDto,
  InvoiceFileRequestDto,
  InvoiceUsageQueryDto,
  PaymentStatusDto,
  PortalFileRequestDto,
  ReservationCodeRequestDto,
  SearchByTransactionUuidDto,
  SearchInvoicesDto,
  SendBatchInvoiceDto,
  SendEmailToCustomerDto,
  SendInvoiceEmailDto,
  SendToTaxAuthorityDto,
  SignatureDto,
  TemplateQueryDto,
  UpdatePrintStatusDto,
  UpdateQrScanDto,
  UpdateTaxDeclarationDto,
  UsageRangeDto,
} from './dto/api.dto';
import {
  ViettelInvoicePayloadDto,
  ViettelSecretInvoicePayloadDto,
} from './dto/invoice-payload.dto';
import { getViettelSinvoiceConfig } from './viettel-sinvoice.config';
import {
  VIETTEL_ENDPOINTS,
  ViettelEndpointDefinition,
} from './viettel-sinvoice.constants';
import { ViettelSinvoiceHttpService } from './viettel-sinvoice-http.service';
import {
  ViettelEnvelope,
  ViettelInvoiceFileResult,
  ViettelInvoiceListResponse,
  ViettelIssueResult,
  ViettelTransactionSearchResult,
} from './responses/viettel.responses';
import { ViettelSinvoiceException } from './exceptions/viettel-sinvoice.exception';

/**
 * A signed invoice's number is its series followed by the sequence
 * ("K26TXM2813"). An unsigned 7.8 draft comes back from 7.21 with the bare
 * series ("C21TIS"), which must not be mistaken for a number.
 */
export function numberedInvoiceNo(invoiceNo?: string | null): string {
  const value = invoiceNo?.trim() ?? '';
  return /\d$/.test(value) ? value : '';
}

@Injectable()
export class ViettelSinvoiceService implements EInvoiceProvider {
  constructor(
    private readonly http: ViettelSinvoiceHttpService,
    private readonly configService: ConfigService,
  ) {}

  async issueInvoice(
    payload: ViettelInvoicePayloadDto,
    taxCode: string,
  ): Promise<ViettelIssueResult> {
    return this.issue(payload, taxCode);
  }

  async replaceInvoice(
    payload: ViettelInvoicePayloadDto,
    taxCode: string,
  ): Promise<ViettelIssueResult> {
    payload.generalInvoiceInfo.adjustmentType = '3';
    return this.issue(payload, taxCode);
  }

  async adjustInvoice(
    payload: ViettelInvoicePayloadDto,
    taxCode: string,
  ): Promise<ViettelIssueResult> {
    payload.generalInvoiceInfo.adjustmentType = '5';
    return this.issue(payload, taxCode);
  }

  private async issue(
    payload: ViettelInvoicePayloadDto,
    taxCode: string,
  ): Promise<ViettelIssueResult> {
    const envelope = await this.request<
      ViettelEnvelope<ViettelIssueResult> & ViettelIssueResult
    >(
      VIETTEL_ENDPOINTS.issue,
      payload,
      { supplierTaxCode: taxCode },
      payload.generalInvoiceInfo.transactionUuid,
    );
    const result = this.unwrapOrSelf(
      envelope,
      VIETTEL_ENDPOINTS.issue.path,
      payload.generalInvoiceInfo.transactionUuid,
    );
    return { ...result, invoiceNo: numberedInvoiceNo(result.invoiceNo) };
  }

  async getInvoiceRepresentationFile(
    dto: InvoiceFileRequestDto,
  ): Promise<ViettelInvoiceFileResult> {
    const response = await this.request<
      ViettelEnvelope<ViettelInvoiceFileResult> & ViettelInvoiceFileResult
    >(
      VIETTEL_ENDPOINTS.representationFile,
      dto,
      undefined,
      dto.transactionUuid,
    );
    return this.unwrapOrSelf(
      response,
      VIETTEL_ENDPOINTS.representationFile.path,
      dto.transactionUuid,
    );
  }

  getInvoiceFile(
    dto: InvoiceFileRequestDto,
  ): Promise<ViettelInvoiceFileResult> {
    return this.getInvoiceRepresentationFile(dto);
  }

  getInvoiceFilePortal(dto: PortalFileRequestDto): Promise<unknown> {
    return this.request(VIETTEL_ENDPOINTS.portalFile, dto);
  }

  createExchangeInvoiceFile(dto: ExchangeFileRequestDto): Promise<unknown> {
    return this.request(VIETTEL_ENDPOINTS.exchangeFile, dto);
  }

  searchInvoices(
    taxCode: string,
    dto: SearchInvoicesDto,
  ): Promise<ViettelInvoiceListResponse> {
    return this.request<ViettelInvoiceListResponse>(
      VIETTEL_ENDPOINTS.search,
      dto,
      { supplierTaxCode: taxCode },
    );
  }

  getCustomFields(taxCode: string, templateCode?: string): Promise<unknown> {
    return this.http.request({
      endpoint: VIETTEL_ENDPOINTS.customFields,
      query: { taxCode, templateCode },
    });
  }

  /** 7.8: the draft has no number; the accountant signs it on the portal. */
  async createOrUpdateInvoiceDraft(
    payload: ViettelInvoicePayloadDto,
    taxCode: string,
  ): Promise<Partial<ViettelIssueResult>> {
    const response = await this.request<
      ViettelEnvelope<Partial<ViettelIssueResult>> & Partial<ViettelIssueResult>
    >(
      VIETTEL_ENDPOINTS.draft,
      payload,
      { supplierTaxCode: taxCode },
      payload.generalInvoiceInfo.transactionUuid,
    );
    return this.unwrapOrSelf(
      response,
      VIETTEL_ENDPOINTS.draft.path,
      payload.generalInvoiceInfo.transactionUuid,
    );
  }

  async cancelInvoice(dto: CancelInvoiceDto): Promise<unknown> {
    const response = await this.request<ViettelEnvelope<unknown>>(
      VIETTEL_ENDPOINTS.cancel,
      dto,
    );
    return this.assertBusinessSuccess(response, VIETTEL_ENDPOINTS.cancel.path);
  }

  updateTaxDeclaration(dto: UpdateTaxDeclarationDto): Promise<unknown> {
    return this.request(VIETTEL_ENDPOINTS.taxDeclaration, dto);
  }

  getInvoiceUsageRange(dto: UsageRangeDto): Promise<unknown> {
    return this.request(VIETTEL_ENDPOINTS.usageRange, dto);
  }

  createBatchInvoice(
    taxCode: string,
    dto: SendBatchInvoiceDto,
  ): Promise<unknown> {
    if (dto.invoices.length > 50) {
      throw new ViettelSinvoiceException(
        'VALIDATION_ERROR',
        null,
        null,
        'Mỗi lô tối đa 50 hóa đơn',
        VIETTEL_ENDPOINTS.batch.path,
        null,
        false,
      );
    }
    return this.request(VIETTEL_ENDPOINTS.batch, dto, {
      supplierTaxCode: taxCode,
    });
  }

  getInvoicesByDateRange(dto: DateRangeDto): Promise<unknown> {
    return this.request(VIETTEL_ENDPOINTS.listByDate, dto);
  }

  async sendHtmlMailProcess(dto: SendInvoiceEmailDto): Promise<unknown> {
    const response = await this.request<ViettelEnvelope<unknown>>(
      VIETTEL_ENDPOINTS.sendMail,
      dto,
    );
    return this.assertBusinessSuccess(
      response,
      VIETTEL_ENDPOINTS.sendMail.path,
    );
  }

  getUsbTokenHash(
    payload: ViettelInvoicePayloadDto,
    taxCode: string,
  ): Promise<unknown> {
    return this.request(VIETTEL_ENDPOINTS.getHash, payload, {
      supplierTaxCode: taxCode,
    });
  }

  submitUsbTokenSignature(dto: SignatureDto): Promise<unknown> {
    return this.request(VIETTEL_ENDPOINTS.insertSignature, dto);
  }

  convertFont(dto: ConvertFontDto): Promise<unknown> {
    return this.request(VIETTEL_ENDPOINTS.convertFont, dto);
  }

  updatePaymentStatus(dto: PaymentStatusDto): Promise<unknown> {
    return this.request(VIETTEL_ENDPOINTS.updatePayment, dto);
  }

  cancelPaymentStatus(dto: PaymentStatusDto): Promise<unknown> {
    return this.request(VIETTEL_ENDPOINTS.cancelPayment, dto);
  }

  previewInvoiceDraft(
    payload: ViettelInvoicePayloadDto,
    taxCode: string,
  ): Promise<unknown> {
    return this.request(VIETTEL_ENDPOINTS.preview, payload, {
      supplierTaxCode: taxCode,
    });
  }

  async findByTransactionUuid(
    dto: SearchByTransactionUuidDto,
  ): Promise<ViettelTransactionSearchResult> {
    const response = await this.request<
      ViettelEnvelope<
        ViettelTransactionSearchResult | ViettelTransactionSearchResult[]
      > &
        ViettelTransactionSearchResult
    >(VIETTEL_ENDPOINTS.byTransactionUuid, dto, undefined, dto.transactionUuid);
    return this.unwrapTransactionSearch(
      response,
      VIETTEL_ENDPOINTS.byTransactionUuid.path,
      dto.transactionUuid,
    );
  }

  async getInvoiceByTransactionUuid(
    taxCode: string,
    uuid: string,
  ): Promise<ViettelTransactionSearchResult> {
    try {
      return await this.findByTransactionUuid({
        supplierTaxCode: taxCode,
        transactionUuid: uuid,
      });
    } catch (error) {
      if (!(error instanceof ViettelSinvoiceException) || !error.retryable)
        throw error;

      // Viettel production can return HTTP 500 GENERAL from 7.21 while the
      // invoice is visible on the portal. 7.6 exposes transactionUuid for
      // both unsigned drafts and issued invoices, so it is a safe read-only
      // reconciliation path when the dedicated lookup is unavailable.
      const found = await this.findInRecentInvoiceList(taxCode, uuid);
      if (found) return found;

      // Tell the workflow that the fallback itself was healthy. Real issue
      // retries must still not resend 7.2; draft retries may safely upsert 7.8
      // with the same UUID.
      return { invoiceNo: '', lookupDegraded: true };
    }
  }

  private async findInRecentInvoiceList(
    taxCode: string,
    uuid: string,
  ): Promise<ViettelTransactionSearchResult | null> {
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 31);
    const rowPerPage = 1000;
    let pageNum = 1;
    let totalRows = Number.POSITIVE_INFINITY;

    while ((pageNum - 1) * rowPerPage < totalRows) {
      const response = await this.searchInvoices(taxCode, {
        startDate: this.vietnamDate(start),
        endDate: this.vietnamDate(end),
        pageNum,
        rowPerPage,
      });
      const errorCode = this.getBusinessErrorCode(response);
      if (errorCode) {
        throw new ViettelSinvoiceException(
          'VALIDATION_ERROR',
          null,
          errorCode,
          response.description ?? response.message ?? 'Viettel business error',
          VIETTEL_ENDPOINTS.search.path,
          uuid,
          false,
        );
      }
      const rows = response.invoices ?? [];
      const match = rows.find((row) => row.transactionUuid === uuid);
      if (match) {
        return {
          invoiceNo: numberedInvoiceNo(match.invoiceNo),
          reservationCode: match.reservationCode,
          codeOfTax: match.codeOfTax,
          issueDate: match.issueDate ?? match.issueDateStr,
          exists: true,
        };
      }
      totalRows = Number(
        response.totalRows ?? response.totalRow ?? rows.length,
      );
      if (rows.length === 0) break;
      pageNum += 1;
    }
    return null;
  }

  private vietnamDate(value: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value);
  }

  getReservationCodes(
    taxCode: string,
    dto: ReservationCodeRequestDto,
  ): Promise<unknown> {
    return this.request(VIETTEL_ENDPOINTS.reservationCodes, dto, { taxCode });
  }

  updateInvoicePrintStatus(dto: UpdatePrintStatusDto): Promise<unknown> {
    return this.request(VIETTEL_ENDPOINTS.printStatus, dto);
  }

  updateInvoiceScanQrcode(dto: UpdateQrScanDto): Promise<unknown> {
    return this.request(VIETTEL_ENDPOINTS.qrScan, dto);
  }

  getInvoiceUsage(query: InvoiceUsageQueryDto): Promise<unknown> {
    return this.http.request({
      endpoint: VIETTEL_ENDPOINTS.invoiceUsage,
      query,
    });
  }

  updateInvoiceExplanation(dto: InvoiceExplanationDto): Promise<unknown> {
    return this.request(VIETTEL_ENDPOINTS.explanation, dto);
  }

  createInvoiceWithReservationCode(
    taxCode: string,
    payload: ViettelSecretInvoicePayloadDto,
  ): Promise<unknown> {
    return this.requestAmbiguous(
      'createInvoiceWithCode',
      VIETTEL_ENDPOINTS.createWithCode,
      payload,
      { taxCode },
    );
  }

  getSecretInvoiceUsbHash(
    payload: ViettelInvoicePayloadDto,
    taxCode: string,
  ): Promise<unknown> {
    return this.getUsbTokenHash(payload, taxCode);
  }

  createSecretInvoiceUsbSignature(dto: SignatureDto): Promise<unknown> {
    return this.submitUsbTokenSignature(dto);
  }

  getAllInvoiceTemplates(dto: TemplateQueryDto): Promise<unknown> {
    return this.requestAmbiguous(
      'getAllInvoiceTemplates',
      VIETTEL_ENDPOINTS.templates,
      dto,
    );
  }

  getCloudCaHash(
    payload: ViettelInvoicePayloadDto,
    taxCode: string,
  ): Promise<unknown> {
    return this.getUsbTokenHash(payload, taxCode);
  }

  submitCloudCaSignature(dto: SignatureDto): Promise<unknown> {
    return this.submitUsbTokenSignature(dto);
  }

  getSecretInvoiceCloudCaHash(
    payload: ViettelInvoicePayloadDto,
    taxCode: string,
  ): Promise<unknown> {
    return this.getCloudCaHash(payload, taxCode);
  }

  createSecretInvoiceCloudCa(dto: SignatureDto): Promise<unknown> {
    return this.submitCloudCaSignature(dto);
  }

  async sendEmailToCustomer(dto: SendEmailToCustomerDto): Promise<unknown> {
    const response = await this.request<ViettelEnvelope<unknown>>(
      VIETTEL_ENDPOINTS.sendEmailToCustomer,
      dto,
      undefined,
      dto.transactionUuid,
    );
    return this.assertBusinessSuccess(
      response,
      VIETTEL_ENDPOINTS.sendEmailToCustomer.path,
      dto.transactionUuid,
    );
  }

  sendInvoiceEmail(dto: SendEmailToCustomerDto): Promise<unknown> {
    return this.sendEmailToCustomer(dto);
  }

  createFuelInvoiceDraft(
    payload: ViettelInvoicePayloadDto,
    taxCode: string,
  ): Promise<unknown> {
    return this.request(VIETTEL_ENDPOINTS.fuelDraft, payload, {
      supplierTaxCode: taxCode,
    });
  }

  getInvoicesWithProducts(
    taxCode: string,
    dto: SearchInvoicesDto,
  ): Promise<unknown> {
    return this.requestAmbiguous(
      'getAllInvoices',
      VIETTEL_ENDPOINTS.invoicesWithProducts,
      dto,
      { supplierTaxCode: taxCode },
    );
  }

  sendInvoiceToTaxAuthority(dto: SendToTaxAuthorityDto): Promise<unknown> {
    return this.request(VIETTEL_ENDPOINTS.sendToTaxAuthority, dto);
  }

  getInvoicesWithProductsUtc7(
    taxCode: string,
    dto: SearchInvoicesDto,
  ): Promise<unknown> {
    return this.requestAmbiguous(
      'getInvoicesAll',
      VIETTEL_ENDPOINTS.invoicesWithProductsUtc7,
      dto,
      { supplierTaxCode: taxCode },
    );
  }

  private request<T = unknown>(
    endpoint: ViettelEndpointDefinition,
    data?: object,
    pathParams?: Record<string, string>,
    transactionUuid?: string,
  ): Promise<T> {
    return this.http.request<T>({
      endpoint,
      data,
      pathParams,
      transactionUuid,
    });
  }

  private requestAmbiguous<T = unknown>(
    configKey: string,
    endpoint: ViettelEndpointDefinition,
    data?: object,
    pathParams?: Record<string, string>,
  ): Promise<T> {
    const method = getViettelSinvoiceConfig(this.configService).endpointMethods[
      configKey
    ];
    return this.http.request<T>({
      endpoint,
      data,
      pathParams,
      methodOverride: method,
    });
  }

  private unwrap<T>(
    envelope: ViettelEnvelope<T>,
    endpoint: string,
    uuid?: string,
  ): T {
    const errorCode = this.getBusinessErrorCode(envelope);
    if (errorCode) {
      throw new ViettelSinvoiceException(
        'VALIDATION_ERROR',
        null,
        errorCode,
        envelope.description ?? envelope.message ?? 'Viettel business error',
        endpoint,
        uuid ?? null,
        false,
      );
    }
    const result = envelope.result ?? envelope.data;
    if (!result) {
      throw new ViettelSinvoiceException(
        'UNKNOWN',
        null,
        null,
        'Viettel response does not contain result',
        endpoint,
        uuid ?? null,
        false,
      );
    }
    return result;
  }

  private unwrapOrSelf<T extends object>(
    response: ViettelEnvelope<T> & T,
    endpoint: string,
    uuid?: string,
  ): T {
    const errorCode = this.getBusinessErrorCode(response);
    if (errorCode) {
      throw new ViettelSinvoiceException(
        'VALIDATION_ERROR',
        null,
        errorCode,
        response.description ?? response.message ?? 'Viettel business error',
        endpoint,
        uuid ?? null,
        false,
      );
    }
    return response.result ?? response.data ?? response;
  }

  private assertBusinessSuccess<T>(
    response: ViettelEnvelope<T>,
    endpoint: string,
    uuid?: string,
  ): ViettelEnvelope<T> | T {
    const errorCode = this.getBusinessErrorCode(response);
    if (errorCode) {
      throw new ViettelSinvoiceException(
        'VALIDATION_ERROR',
        null,
        errorCode,
        response.description ?? response.message ?? 'Viettel business error',
        endpoint,
        uuid ?? null,
        false,
      );
    }
    return response.result ?? response.data ?? response;
  }

  private unwrapTransactionSearch(
    response: ViettelEnvelope<
      ViettelTransactionSearchResult | ViettelTransactionSearchResult[]
    > &
      ViettelTransactionSearchResult,
    endpoint: string,
    uuid: string,
  ): ViettelTransactionSearchResult {
    const errorCode = this.getBusinessErrorCode(response);
    if (errorCode) {
      throw new ViettelSinvoiceException(
        'VALIDATION_ERROR',
        null,
        errorCode,
        response.description ?? response.message ?? 'Viettel business error',
        endpoint,
        uuid,
        false,
      );
    }
    const result = response.result ?? response.data ?? response;
    const record = Array.isArray(result) ? result[0] : result;
    if (!record) return { invoiceNo: '' };
    return {
      ...record,
      invoiceNo: numberedInvoiceNo(record.invoiceNo),
      exists: true,
    };
  }

  private getBusinessErrorCode(
    response: ViettelEnvelope<unknown>,
  ): string | null {
    if (response.errorCode != null && response.errorCode !== '') {
      const errorCode = String(response.errorCode);
      return this.isSuccessCode(errorCode) ? null : errorCode;
    }
    if (response.code == null || response.code === '') return null;
    const code = String(response.code);
    return this.isSuccessCode(code) ? null : code;
  }

  private isSuccessCode(code: string): boolean {
    const normalized = code.trim().toUpperCase();
    return ['0', '00', '200', '201', 'SUCCESS', 'OK'].includes(normalized);
  }
}
