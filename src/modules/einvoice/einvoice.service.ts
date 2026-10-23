import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { readFile } from 'fs/promises';
import { basename } from 'path';
import { Queue } from 'bullmq';
import JSZip from 'jszip';
import { EntityManager, In, Not, Repository } from 'typeorm';
import { PaginatedResult } from '../../common/dto/paginated-result.dto';
import {
  PaymentOrderStatus,
  ReceiptStatus,
  ReconciliationStatus,
} from '../../common/enums/status.enum';
import { PaymentOrder } from '../../payment-orders/entities/payment-order.entity';
import { Receipt } from '../../receipts/entities/receipt.entity';
import { BankReconciliation } from '../../reconciliation/entities/bank-reconciliation.entity';
import { EInvoiceConfig } from './entities/einvoice-config.entity';
import { EInvoice } from './entities/einvoice.entity';
import { EInvoiceEvent } from './entities/einvoice-event.entity';
import { EInvoiceFile } from './entities/einvoice-file.entity';
import { EInvoiceAttempt } from './entities/einvoice-attempt.entity';
import {
  EInvoiceAttemptOperation,
  EInvoiceAttemptStatus,
  EInvoiceIssueMode,
  EInvoiceStatus,
} from './entities/einvoice.enums';
import { ParentEInvoiceSummaryDto } from './dto/parent-einvoice-summary.dto';
import { QueryEInvoiceDto } from './dto/query-einvoice.dto';
import { UpsertEInvoiceConfigDto } from './dto/upsert-einvoice-config.dto';
import { E_INVOICE_PROVIDER } from './providers/einvoice-provider.interface';
import type { EInvoiceProvider } from './providers/einvoice-provider.interface';
import { getViettelSinvoiceConfig } from './providers/viettel/viettel-sinvoice.config';
import {
  E_INVOICE_JOBS,
  E_INVOICE_QUEUES,
} from './providers/viettel/viettel-sinvoice.constants';
import { ViettelSinvoiceException } from './providers/viettel/exceptions/viettel-sinvoice.exception';

interface PendingInvoiceInput {
  schoolId: string;
  paymentId: string;
  receiptId: string;
  studentId: string;
  /** Order the payment was matched to; its invoiceEmail becomes buyerEmail. */
  paymentOrderId: string | null;
}

/** Viettel's "-1": tuition is not subject to VAT (KCT). */
const DEFAULT_TAX_PERCENTAGE = '-1';

const AWAITING_PAYMENT = [
  PaymentOrderStatus.PENDING,
  PaymentOrderStatus.PARTIALLY_PAID,
];

const SORT_COLUMNS = new Map([
  ['createdAt', 'i.createdAt'],
  ['issuedAt', 'i.issuedAt'],
  ['invoiceNo', 'i.invoiceNo'],
  ['status', 'i.status'],
]);

@Injectable()
export class EInvoiceService {
  constructor(
    @InjectRepository(EInvoice) private readonly invoices: Repository<EInvoice>,
    @InjectRepository(EInvoiceConfig)
    private readonly configs: Repository<EInvoiceConfig>,
    @InjectRepository(EInvoiceFile)
    private readonly files: Repository<EInvoiceFile>,
    @InjectRepository(EInvoiceEvent)
    private readonly events: Repository<EInvoiceEvent>,
    @InjectQueue(E_INVOICE_QUEUES.ISSUE) private readonly issueQueue: Queue,
    @InjectQueue(E_INVOICE_QUEUES.RECONCILE)
    private readonly reconcileQueue: Queue,
    @InjectQueue(E_INVOICE_QUEUES.DOWNLOAD)
    private readonly downloadQueue: Queue,
    @InjectQueue(E_INVOICE_QUEUES.SEND_EMAIL)
    private readonly emailQueue: Queue,
    @Inject(E_INVOICE_PROVIDER) private readonly provider: EInvoiceProvider,
    private readonly configService: ConfigService,
  ) {}

  async prepareForReceipt(
    input: PendingInvoiceInput,
    manager: EntityManager,
  ): Promise<EInvoice | null> {
    const global = getViettelSinvoiceConfig(this.configService);
    if (!global.enabled) return null;
    const config = await this.schoolConfig(input.schoolId, manager);
    if (!config?.enabled || !config.autoIssue) return null;
    // The system-wide AUTO_ISSUE switch only guards real issuance: a draft
    // is not a tax document until the accountant signs it on the portal.
    if (config.issueMode !== EInvoiceIssueMode.DRAFT && !global.autoIssue)
      return null;

    await this.insertPending(input, config, manager);
    const invoice = await manager.getRepository(EInvoice).findOneOrFail({
      where: { receiptId: input.receiptId },
    });
    if (invoice.status === EInvoiceStatus.PENDING) {
      await manager.getRepository(EInvoiceEvent).insert({
        invoiceId: invoice.id,
        eventType: 'INVOICE_PREPARED',
        payload: { paymentId: input.paymentId, receiptId: input.receiptId },
      });
    }
    return invoice;
  }

  findReceipt(receiptId: string): Promise<Receipt | null> {
    return this.invoices.manager
      .getRepository(Receipt)
      .findOne({ where: { id: receiptId } });
  }

  /**
   * Manual "Xuất hóa đơn" for a receipt the automatic flow skipped: the
   * school had auto-issue off, or the receipt predates the integration.
   */
  async issueForReceipt(receiptId: string): Promise<EInvoice> {
    if (!getViettelSinvoiceConfig(this.configService).enabled) {
      throw new BadRequestException(
        'Tích hợp hóa đơn điện tử Viettel đang tắt trên máy chủ',
      );
    }
    const invoice = await this.invoices.manager.transaction(async (manager) => {
      const receipt = await manager
        .getRepository(Receipt)
        .findOne({ where: { id: receiptId } });
      if (!receipt) throw new NotFoundException('Không tìm thấy phiếu thu');
      if (receipt.status !== ReceiptStatus.ISSUED) {
        throw new BadRequestException(
          'Phiếu thu đã hủy nên không thể xuất hóa đơn',
        );
      }
      if (!receipt.paymentTransactionId) {
        throw new BadRequestException(
          'Phiếu thu không gắn với giao dịch thanh toán nên không thể xuất hóa đơn',
        );
      }
      const repo = manager.getRepository(EInvoice);
      if (await repo.exists({ where: { receiptId } })) {
        throw new BadRequestException('Phiếu thu đã có hóa đơn điện tử');
      }
      const config = await this.schoolConfig(receipt.schoolId, manager);
      if (!config?.enabled) {
        throw new BadRequestException('Trường chưa bật hóa đơn điện tử');
      }
      const match = await manager.getRepository(BankReconciliation).findOne({
        where: {
          paymentTransactionId: receipt.paymentTransactionId,
          status: In([
            ReconciliationStatus.AUTO_MATCHED,
            ReconciliationStatus.MANUAL_MATCHED,
          ]),
        },
        order: { createdAt: 'DESC' },
      });
      const input = {
        schoolId: receipt.schoolId,
        paymentId: receipt.paymentTransactionId,
        receiptId,
        studentId: receipt.studentId,
        paymentOrderId: match?.paymentOrderId ?? null,
      };
      await this.insertPending(input, config, manager);
      // The insert is skipped when the payment already has another active invoice.
      const created = await repo.findOne({ where: { receiptId } });
      if (!created) {
        throw new BadRequestException(
          'Giao dịch của phiếu thu đã có hóa đơn điện tử khác',
        );
      }
      await manager.getRepository(EInvoiceEvent).insert({
        invoiceId: created.id,
        eventType: 'INVOICE_PREPARED',
        payload: {
          ...input,
          paymentOrderId: input.paymentOrderId ?? undefined,
          manual: true,
        },
      });
      return created;
    });
    await this.enqueueIssue(invoice.id);
    return invoice;
  }

  /**
   * The school's e-invoice settings. A school that never set them gets the
   * system default when its first payment is matched: drafts on the
   * company's Viettel account (VIETTEL_SINVOICE_TAX_CODE, template, series),
   * tuition not subject to VAT. A draft is no tax document until the
   * accountant signs it on the portal, so defaulting to one is safe; a school
   * that turned invoicing off keeps its row and is left alone.
   */
  private async schoolConfig(
    schoolId: string,
    manager: EntityManager,
  ): Promise<EInvoiceConfig | null> {
    const repo = manager.getRepository(EInvoiceConfig);
    const existing = await repo.findOne({ where: { schoolId } });
    if (existing) return existing;
    const global = getViettelSinvoiceConfig(this.configService);
    if (!global.taxCode || !global.templateCode || !global.series) return null;
    await repo
      .createQueryBuilder()
      .insert()
      .values({
        schoolId,
        provider: 'VIETTEL',
        enabled: true,
        autoIssue: true,
        issueMode: EInvoiceIssueMode.DRAFT,
        supplierTaxCode: global.taxCode,
        templateCode: global.templateCode,
        invoiceSeries: global.series,
        currencyCode: 'VND',
        taxPercentage: DEFAULT_TAX_PERCENTAGE,
        pricesIncludeTax: null,
        signingMode: 'HSM',
        metadata: { source: 'SYSTEM_DEFAULT' },
      })
      // Two payments of the same school may race here: one row wins.
      .orIgnore()
      .execute();
    return repo.findOne({ where: { schoolId } });
  }

  private async insertPending(
    input: PendingInvoiceInput,
    config: EInvoiceConfig,
    manager: EntityManager,
  ): Promise<void> {
    const order = input.paymentOrderId
      ? await manager.getRepository(PaymentOrder).findOne({
          where: { id: input.paymentOrderId },
          select: { id: true, invoiceEmail: true },
        })
      : null;
    await manager
      .getRepository(EInvoice)
      .createQueryBuilder()
      .insert()
      .values({
        schoolId: input.schoolId,
        provider: config.provider,
        paymentId: input.paymentId,
        receiptId: input.receiptId,
        studentId: input.studentId,
        paymentOrderId: input.paymentOrderId,
        buyerEmail: order?.invoiceEmail ?? null,
        supplierTaxCode: config.supplierTaxCode,
        templateCode: config.templateCode,
        invoiceSeries: config.invoiceSeries,
        transactionUuid: randomUUID(),
        adjustmentType: '1',
        status: EInvoiceStatus.PENDING,
      })
      .orIgnore()
      .execute();
  }

  /**
   * The e-invoice a parent asked for on an order, or null when they did not.
   * No invoice exists before a payment is matched, so until then the state is
   * the order's: awaiting payment, or cancelled once it can no longer be paid.
   */
  async summaryForPaymentOrder(
    order: Pick<PaymentOrder, 'id' | 'status' | 'invoiceEmail'>,
  ): Promise<ParentEInvoiceSummaryDto | null> {
    if (!order.invoiceEmail) return null;
    const invoices = await this.invoices.find({
      where: { paymentOrderId: order.id },
      order: { createdAt: 'DESC' },
    });
    const awaitingPayment = AWAITING_PAYMENT.includes(order.status);
    const invoice =
      invoices.find((i) => i.status !== EInvoiceStatus.CANCELLED) ??
      // A legally cancelled invoice of a paid order is still its invoice.
      (order.status === PaymentOrderStatus.PAID ? invoices[0] : undefined);
    if (invoice) {
      return {
        status: invoice.status,
        buyerEmail: invoice.buyerEmail ?? order.invoiceEmail,
        invoiceNo: invoice.invoiceNo,
        issuedAt: invoice.issuedAt,
        emailSentAt: invoice.emailSentAt,
      };
    }
    return {
      status: awaitingPayment
        ? 'PENDING_PAYMENT'
        : order.status === PaymentOrderStatus.PAID
          ? EInvoiceStatus.PENDING
          : EInvoiceStatus.CANCELLED,
      buyerEmail: order.invoiceEmail,
      invoiceNo: null,
      issuedAt: null,
      emailSentAt: null,
    };
  }

  getProviderStatus(): {
    provider: string;
    enabled: boolean;
    autoIssue: boolean;
  } {
    const global = getViettelSinvoiceConfig(this.configService);
    return {
      provider: 'VIETTEL',
      enabled: global.enabled,
      autoIssue: global.autoIssue,
    };
  }

  async enqueueIssue(invoiceId: string): Promise<void> {
    const claim = await this.invoices.update(
      { id: invoiceId, status: EInvoiceStatus.PENDING },
      { status: EInvoiceStatus.QUEUED },
    );
    if (!claim.affected) return;
    try {
      await this.issueQueue.add(
        E_INVOICE_JOBS.ISSUE,
        { invoiceId },
        {
          jobId: `issue-${invoiceId}-${Date.now()}`,
          attempts: 5,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      );
    } catch (error) {
      await this.invoices.update(
        { id: invoiceId, status: EInvoiceStatus.QUEUED },
        { status: EInvoiceStatus.PENDING },
      );
      throw error;
    }
  }

  async enqueuePendingForPayment(paymentId: string): Promise<void> {
    const invoice = await this.invoices.findOne({
      where: { paymentId, status: EInvoiceStatus.PENDING },
    });
    if (invoice) await this.enqueueIssue(invoice.id);
  }

  /**
   * Runs inside the unmatch transaction. An invoice Viettel never received is
   * voided here; one Viettel may already hold has to be cancelled explicitly
   * first, since cancelling an e-invoice is a legal act with its own reason.
   */
  async releaseForUnmatchedPayment(
    paymentId: string,
    reason: string,
    manager: EntityManager,
  ): Promise<void> {
    const repo = manager.getRepository(EInvoice);
    const invoice = await repo.findOne({
      where: { paymentId, status: Not(EInvoiceStatus.CANCELLED) },
    });
    if (!invoice) return;
    if (invoice.invoiceNo) {
      throw new BadRequestException(
        `Giao dịch đã xuất hóa đơn điện tử số ${invoice.invoiceNo}; hãy hủy hóa đơn trước khi hủy khớp`,
      );
    }
    if (invoice.status === EInvoiceStatus.DRAFT) {
      return this.voidDraft(invoice, reason, manager);
    }
    if (await this.mayExistAtProvider(invoice, manager)) {
      throw new BadRequestException(
        'Hóa đơn điện tử của giao dịch đã gửi sang Viettel nhưng chưa có số; hãy đồng bộ rồi hủy hóa đơn trước khi hủy khớp',
      );
    }
    const voided = await repo.update(
      {
        id: invoice.id,
        status: In([
          EInvoiceStatus.PENDING,
          EInvoiceStatus.QUEUED,
          EInvoiceStatus.FAILED,
        ]),
      },
      { status: EInvoiceStatus.CANCELLED },
    );
    if (!voided.affected) {
      throw new BadRequestException(
        'Hóa đơn điện tử của giao dịch đang được phát hành; vui lòng thử lại sau',
      );
    }
    await manager.getRepository(EInvoiceEvent).insert({
      invoiceId: invoice.id,
      eventType: 'INVOICE_VOIDED',
      payload: { reason },
    });
  }

  /**
   * A draft is not a tax document, so it can be voided here, but only after
   * 7.21 confirms the accountant has not signed it on the portal meanwhile.
   * Viettel has no API to delete a draft: it stays on the portal for the
   * accountant to delete by hand.
   */
  private async voidDraft(
    invoice: EInvoice,
    reason: string,
    manager: EntityManager,
  ): Promise<void> {
    let signedNo: string | null = null;
    try {
      const found = await this.provider.getInvoiceByTransactionUuid(
        invoice.supplierTaxCode,
        invoice.transactionUuid,
      );
      signedNo = found.invoiceNo || null;
    } catch (error) {
      if (!(error instanceof ViettelSinvoiceException) || error.retryable) {
        throw new BadRequestException(
          'Không kiểm tra được hóa đơn nháp trên Viettel; vui lòng thử lại sau',
        );
      }
    }
    if (signedNo) {
      throw new BadRequestException(
        `Hóa đơn nháp đã được ký trên Viettel với số ${signedNo}; hãy bấm Đồng bộ rồi hủy hóa đơn trước khi hủy khớp`,
      );
    }
    const voided = await manager
      .getRepository(EInvoice)
      .update(
        { id: invoice.id, status: EInvoiceStatus.DRAFT },
        { status: EInvoiceStatus.CANCELLED },
      );
    if (!voided.affected) {
      throw new BadRequestException(
        'Hóa đơn điện tử của giao dịch vừa thay đổi trạng thái; vui lòng thử lại',
      );
    }
    await manager.getRepository(EInvoiceEvent).insert({
      invoiceId: invoice.id,
      eventType: 'DRAFT_VOIDED',
      payload: { reason, providerDraftLeft: true },
    });
  }

  private async mayExistAtProvider(
    invoice: EInvoice,
    manager: EntityManager,
  ): Promise<boolean> {
    if (invoice.transactionId) return true;
    if (invoice.status === EInvoiceStatus.PENDING) return false;
    if (
      invoice.status !== EInvoiceStatus.QUEUED &&
      invoice.status !== EInvoiceStatus.FAILED
    )
      return true;
    // A timeout/5xx leaves it unknown whether Viettel created the invoice.
    return manager.getRepository(EInvoiceAttempt).exists({
      where: {
        invoiceId: invoice.id,
        operation: EInvoiceAttemptOperation.ISSUE,
        status: EInvoiceAttemptStatus.FAILED,
        retryable: true,
      },
    });
  }

  async findAll(
    query: QueryEInvoiceDto,
    schoolIds: string[] | null,
  ): Promise<PaginatedResult<EInvoice>> {
    const qb = this.invoices
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.student', 'student')
      .leftJoinAndSelect('i.receipt', 'receipt')
      .orderBy(
        SORT_COLUMNS.get(query.sortBy ?? '') ?? 'i.createdAt',
        query.sortOrder ?? 'DESC',
      );
    if (schoolIds) {
      if (schoolIds.length === 0)
        return new PaginatedResult([], 0, query.page ?? 1, query.limit ?? 20);
      qb.andWhere('i.schoolId IN (:...schoolIds)', { schoolIds });
    }
    if (query.schoolId)
      qb.andWhere('i.schoolId = :schoolId', { schoolId: query.schoolId });
    if (query.studentId)
      qb.andWhere('i.studentId = :studentId', { studentId: query.studentId });
    if (query.receiptId)
      qb.andWhere('i.receiptId = :receiptId', { receiptId: query.receiptId });
    if (query.status)
      qb.andWhere('i.status = :status', { status: query.status });
    if (query.search) {
      qb.andWhere(
        '(i.invoiceNo ILIKE :search OR receipt.receiptNumber ILIKE :search OR student.fullName ILIKE :search OR student.studentCode ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    const [data, total] = await qb
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();
    return new PaginatedResult(data, total, query.page ?? 1, query.limit ?? 20);
  }

  findById(id: string): Promise<EInvoice | null> {
    return this.invoices.findOne({
      where: { id },
      relations: { receipt: true, student: true },
    });
  }

  /** Detail view: which files are stored and the recent Viettel calls. */
  async findDetail(id: string) {
    const invoice = await this.invoices.findOne({
      where: { id },
      relations: { receipt: { items: true }, student: true, school: true },
    });
    if (!invoice) return null;
    const [files, attempts] = await Promise.all([
      this.files.find({
        where: { invoiceId: id },
        select: {
          id: true,
          fileType: true,
          fileName: true,
          size: true,
          createdAt: true,
        },
        order: { createdAt: 'ASC' },
      }),
      this.invoices.manager.getRepository(EInvoiceAttempt).find({
        where: { invoiceId: id },
        order: { createdAt: 'DESC' },
        take: 20,
      }),
    ]);
    return { ...invoice, files, attempts };
  }

  async getFile(id: string, type: string): Promise<EInvoiceFile | null> {
    return this.files.findOne({
      where: { invoiceId: id, fileType: type.toUpperCase() },
    });
  }

  /**
   * Viettel has no XML download of its own: the signed XML only travels
   * inside the ZIP of 7.3. Returns null while that ZIP is not stored yet.
   */
  async getXml(
    id: string,
  ): Promise<{ fileName: string; content: Buffer } | null> {
    const zip = await this.getFile(id, 'ZIP');
    if (!zip) return null;
    let archive: JSZip;
    try {
      archive = await JSZip.loadAsync(await readFile(zip.storagePath));
    } catch {
      throw new UnprocessableEntityException(
        'File ZIP của hóa đơn không đọc được',
      );
    }
    const entry = Object.values(archive.files).find(
      (file) => !file.dir && file.name.toLowerCase().endsWith('.xml'),
    );
    if (!entry) {
      throw new NotFoundException('File ZIP của hóa đơn không chứa XML');
    }
    return {
      fileName: basename(entry.name).replace(/[^a-zA-Z0-9._-]/g, '_'),
      content: await entry.async('nodebuffer'),
    };
  }

  async retry(id: string): Promise<void> {
    const invoice = await this.invoices.findOneByOrFail({ id });
    if (invoice.status === EInvoiceStatus.PROCESSING) return;
    if (
      ![
        EInvoiceStatus.PENDING,
        EInvoiceStatus.QUEUED,
        EInvoiceStatus.FAILED,
      ].includes(invoice.status)
    ) {
      throw new BadRequestException(
        'Chỉ được phát hành lại hóa đơn đang chờ hoặc phát hành lỗi',
      );
    }
    invoice.status = EInvoiceStatus.PENDING;
    invoice.errorCode = null;
    invoice.errorDescription = null;
    invoice.reconciliationAttempts = 0;
    await this.invoices.save(invoice);
    await this.enqueueIssue(id);
  }

  async sync(id: string): Promise<void> {
    const invoice = await this.invoices.findOneByOrFail({ id });
    if (invoice.invoiceNo) return;
    // A draft stays a draft until 7.21 shows the accountant signed it.
    if (invoice.status !== EInvoiceStatus.DRAFT) {
      invoice.status = EInvoiceStatus.WAITING_INVOICE_NUMBER;
      await this.invoices.save(invoice);
    }
    await this.reconcileQueue.add(
      E_INVOICE_JOBS.RECONCILE,
      { invoiceId: id },
      {
        jobId: `manual-reconcile-${id}-${Date.now()}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: true,
        removeOnFail: 5000,
      },
    );
  }

  async sendEmail(id: string): Promise<void> {
    const invoice = await this.invoices.findOneByOrFail({ id });
    if (!invoice.invoiceNo || invoice.status === EInvoiceStatus.CANCELLED) {
      throw new BadRequestException(
        'Chỉ gửi email được cho hóa đơn đã phát hành và chưa bị hủy',
      );
    }
    await this.emailQueue.add(
      E_INVOICE_JOBS.SEND_EMAIL,
      { invoiceId: id },
      {
        jobId: `manual-email-${id}-${Date.now()}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: true,
      },
    );
  }

  async requestFile(id: string, fileType: 'PDF' | 'ZIP'): Promise<void> {
    await this.invoices.findOneByOrFail({ id });
    await this.downloadQueue.add(
      E_INVOICE_JOBS.DOWNLOAD,
      { invoiceId: id, fileType },
      {
        jobId: `manual-download-${id}-${fileType}-${Date.now()}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: true,
      },
    );
  }

  async cancel(id: string, reason: string): Promise<void> {
    const invoice = await this.invoices.findOneByOrFail({ id });
    if (invoice.status === EInvoiceStatus.CANCELLED)
      throw new BadRequestException('Hóa đơn đã bị hủy');
    if (!invoice.invoiceNo || !invoice.issuedAt)
      throw new BadRequestException(
        'Hóa đơn chưa được phát hành nên không thể hủy',
      );
    // Viettel dates are Vietnam-local; the server may run in UTC.
    const strIssueDate = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(invoice.issuedAt);
    await this.provider.cancelInvoice({
      supplierTaxCode: invoice.supplierTaxCode,
      invoiceNo: invoice.invoiceNo,
      strIssueDate,
      additionalReferenceDesc: reason,
      additionalReferenceDate: strIssueDate,
      templateCode: invoice.templateCode,
      reasonDelete: reason,
    });
    invoice.status = EInvoiceStatus.CANCELLED;
    await this.invoices.save(invoice);
    await this.events.insert({
      invoiceId: id,
      eventType: 'INVOICE_CANCELLED',
      payload: { reason },
    });
  }

  getConfig(schoolId: string): Promise<EInvoiceConfig | null> {
    return this.configs.findOne({ where: { schoolId } });
  }

  async upsertConfig(
    schoolId: string,
    dto: UpsertEInvoiceConfigDto,
  ): Promise<EInvoiceConfig> {
    const current = await this.configs.findOne({ where: { schoolId } });
    const entity = this.configs.create({
      ...current,
      schoolId,
      provider: 'VIETTEL',
      enabled: dto.enabled,
      autoIssue: dto.autoIssue ?? true,
      // A client that does not know the field keeps the school's mode.
      issueMode: dto.issueMode ?? current?.issueMode ?? EInvoiceIssueMode.DRAFT,
      supplierTaxCode: dto.supplierTaxCode,
      templateCode: dto.templateCode,
      invoiceSeries: dto.invoiceSeries,
      currencyCode: dto.currencyCode ?? 'VND',
      taxPercentage: dto.taxPercentage,
      pricesIncludeTax: dto.pricesIncludeTax ?? null,
      signingMode: dto.signingMode ?? 'HSM',
      // A plain column, not @UpdateDateColumn, so it has to be set here.
      updatedAt: new Date(),
    });
    return this.configs.save(entity);
  }
}
