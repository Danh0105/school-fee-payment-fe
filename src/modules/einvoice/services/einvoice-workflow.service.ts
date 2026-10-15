import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { Queue } from 'bullmq';
import { In, Repository } from 'typeorm';
import { E_INVOICE_PROVIDER } from '../providers/einvoice-provider.interface';
import type { EInvoiceProvider } from '../providers/einvoice-provider.interface';
import { EInvoice } from '../entities/einvoice.entity';
import { EInvoiceAttempt } from '../entities/einvoice-attempt.entity';
import { EInvoiceEvent } from '../entities/einvoice-event.entity';
import { EInvoiceFile } from '../entities/einvoice-file.entity';
import {
  EInvoiceAttemptOperation,
  EInvoiceAttemptStatus,
  EInvoiceIssueMode,
  EInvoiceStatus,
} from '../entities/einvoice.enums';
import { EInvoiceConfig } from '../entities/einvoice-config.entity';
import { ViettelSinvoiceMapper } from '../providers/viettel/viettel-sinvoice.mapper';
import { ViettelSinvoiceException } from '../providers/viettel/exceptions/viettel-sinvoice.exception';
import {
  E_INVOICE_JOBS,
  E_INVOICE_QUEUES,
  RECONCILIATION_DELAYS,
  VIETTEL_ENDPOINTS,
} from '../providers/viettel/viettel-sinvoice.constants';
import { getViettelSinvoiceConfig } from '../providers/viettel/viettel-sinvoice.config';
import { ViettelTransactionSearchResult } from '../providers/viettel/responses/viettel.responses';

/** The email the parent registered on the order wins over the student record's. */
const recipientOf = (invoice: EInvoice): string | null =>
  invoice.buyerEmail ?? invoice.student.parentEmail ?? null;

/** Statuses in which downloaded files still move the invoice forward. */
const FILE_STAGE = [EInvoiceStatus.ISSUED, EInvoiceStatus.FILE_PENDING];

@Injectable()
export class EInvoiceWorkflowService {
  constructor(
    @InjectRepository(EInvoice) private readonly invoices: Repository<EInvoice>,
    @InjectRepository(EInvoiceConfig)
    private readonly configs: Repository<EInvoiceConfig>,
    @InjectRepository(EInvoiceAttempt)
    private readonly attempts: Repository<EInvoiceAttempt>,
    @InjectRepository(EInvoiceFile)
    private readonly files: Repository<EInvoiceFile>,
    @InjectRepository(EInvoiceEvent)
    private readonly events: Repository<EInvoiceEvent>,
    @Inject(E_INVOICE_PROVIDER) private readonly provider: EInvoiceProvider,
    private readonly mapper: ViettelSinvoiceMapper,
    private readonly configService: ConfigService,
    @InjectQueue(E_INVOICE_QUEUES.RECONCILE)
    private readonly reconcileQueue: Queue,
    @InjectQueue(E_INVOICE_QUEUES.DOWNLOAD)
    private readonly downloadQueue: Queue,
    @InjectQueue(E_INVOICE_QUEUES.SEND_EMAIL)
    private readonly emailQueue: Queue,
  ) {}

  async issue(invoiceId: string): Promise<void> {
    const claim = await this.invoices.update(
      {
        id: invoiceId,
        status: In([
          EInvoiceStatus.PENDING,
          EInvoiceStatus.QUEUED,
          EInvoiceStatus.FAILED,
        ]),
      },
      { status: EInvoiceStatus.PROCESSING },
    );
    if (!claim.affected) return;
    const invoice = await this.loadInvoice(invoiceId);
    const resend =
      !!invoice.transactionId ||
      (await this.attempts.exists({
        where: { invoiceId, operation: EInvoiceAttemptOperation.ISSUE },
      }));
    const attempt = await this.startAttempt(
      invoice,
      EInvoiceAttemptOperation.ISSUE,
      VIETTEL_ENDPOINTS.issue.path,
    );
    const started = Date.now();
    try {
      const config = await this.configs.findOneByOrFail({
        schoolId: invoice.schoolId,
      });
      const asDraft = config.issueMode === EInvoiceIssueMode.DRAFT;
      if (asDraft) attempt.endpoint = VIETTEL_ENDPOINTS.draft.path;
      const existing = resend ? await this.findAtProvider(invoice) : null;
      if (existing) {
        await this.events.save(
          this.events.create({
            invoiceId,
            eventType: 'ISSUE_RECOVERED_FROM_PROVIDER',
            payload: {
              invoiceNo: existing.invoiceNo || null,
              transactionID: existing.transactionID ?? null,
            },
          }),
        );
        if (asDraft) await this.applyDraftResult(invoice, existing);
        else await this.applyIssueResult(invoice, existing);
        await this.completeAttempt(attempt, started);
        return;
      }
      const payload = this.mapper.fromReceipt(
        invoice,
        invoice.receipt,
        invoice.student,
        config,
      );
      invoice.rawRequest = JSON.parse(JSON.stringify(payload)) as Record<
        string,
        unknown
      >;
      if (asDraft) {
        const result = await this.provider.createOrUpdateInvoiceDraft(
          payload,
          invoice.supplierTaxCode,
        );
        invoice.rawResponse = JSON.parse(JSON.stringify(result)) as Record<
          string,
          unknown
        >;
        await this.applyDraftResult(invoice, result);
      } else {
        const result = await this.provider.issueInvoice(
          payload,
          invoice.supplierTaxCode,
        );
        invoice.rawResponse = JSON.parse(JSON.stringify(result)) as Record<
          string,
          unknown
        >;
        await this.applyIssueResult(invoice, result);
      }
      await this.completeAttempt(attempt, started);
    } catch (error) {
      await this.fail(invoice, attempt, error, started);
    }
  }

  async reconcile(invoiceId: string): Promise<void> {
    const invoice = await this.loadInvoice(invoiceId);
    if (invoice.status === EInvoiceStatus.DRAFT) return this.syncDraft(invoice);
    if (
      invoice.invoiceNo ||
      invoice.status !== EInvoiceStatus.WAITING_INVOICE_NUMBER
    )
      return;
    const attempt = await this.startAttempt(
      invoice,
      EInvoiceAttemptOperation.RECONCILE,
      VIETTEL_ENDPOINTS.byTransactionUuid.path,
    );
    const started = Date.now();
    try {
      const result = await this.provider.getInvoiceByTransactionUuid(
        invoice.supplierTaxCode,
        invoice.transactionUuid,
      );
      invoice.reconciliationAttempts += 1;
      if (result.invoiceNo) {
        invoice.invoiceNo = result.invoiceNo;
        invoice.reservationCode =
          result.reservationCode ?? invoice.reservationCode;
        invoice.transactionId = result.transactionID ?? invoice.transactionId;
        invoice.codeOfTax = result.codeOfTax ?? invoice.codeOfTax;
        await this.markIssuedAndQueueFiles(invoice);
      } else if (
        invoice.reconciliationAttempts < RECONCILIATION_DELAYS.length
      ) {
        await this.invoices.save(invoice);
        await this.scheduleReconcile(invoiceId, invoice.reconciliationAttempts);
      } else {
        invoice.status = EInvoiceStatus.FAILED;
        invoice.errorCode = 'INVOICE_NOT_READY';
        invoice.errorDescription =
          'Không nhận được số hóa đơn sau số lần đối soát tối đa';
        await this.invoices.save(invoice);
      }
      await this.completeAttempt(attempt, started);
    } catch (error) {
      await this.fail(invoice, attempt, error, started);
    }
  }

  async download(invoiceId: string, fileType: 'PDF' | 'ZIP'): Promise<void> {
    const invoice = await this.loadInvoice(invoiceId);
    if (!invoice.invoiceNo) return;
    const attempt = await this.startAttempt(
      invoice,
      EInvoiceAttemptOperation.DOWNLOAD,
      VIETTEL_ENDPOINTS.representationFile.path,
    );
    const started = Date.now();
    try {
      const result = await this.provider.getInvoiceFile({
        supplierTaxCode: invoice.supplierTaxCode,
        invoiceNo: invoice.invoiceNo,
        templateCode: invoice.templateCode,
        transactionUuid: invoice.transactionUuid,
        fileType,
      });
      const bytes = Array.isArray(result.fileToBytes)
        ? Buffer.from(result.fileToBytes)
        : Buffer.from(result.fileToBytes, 'base64');
      const root = resolve(
        getViettelSinvoiceConfig(this.configService).fileStoragePath,
      );
      const directory = resolve(root, invoice.id);
      await mkdir(directory, { recursive: true });
      const safeName = (
        result.fileName || `${invoice.invoiceNo}.${fileType.toLowerCase()}`
      ).replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = resolve(directory, safeName);
      await writeFile(storagePath, bytes);
      await this.files.upsert(
        {
          invoiceId,
          fileType,
          fileName: safeName,
          storagePath,
          mimeType: fileType === 'PDF' ? 'application/pdf' : 'application/zip',
          size: String(bytes.length),
          provider: invoice.provider,
        },
        ['invoiceId', 'fileType'],
      );
      // A re-download of a completed or cancelled invoice must not move its
      // status back or e-mail the parent again.
      const inFileStage = FILE_STAGE.includes(invoice.status);
      if (inFileStage) {
        const count = await this.files.count({ where: { invoiceId } });
        await this.invoices.update(
          { id: invoiceId, status: In(FILE_STAGE) },
          {
            status:
              count >= 2
                ? EInvoiceStatus.COMPLETED
                : EInvoiceStatus.FILE_PENDING,
          },
        );
      }
      if (inFileStage && fileType === 'PDF' && recipientOf(invoice)) {
        await this.emailQueue.add(
          E_INVOICE_JOBS.SEND_EMAIL,
          { invoiceId },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 30_000 },
            removeOnComplete: true,
          },
        );
      }
      await this.completeAttempt(attempt, started);
    } catch (error) {
      await this.fail(invoice, attempt, error, started);
    }
  }

  async sendEmail(invoiceId: string): Promise<void> {
    const invoice = await this.loadInvoice(invoiceId);
    const email = recipientOf(invoice);
    if (
      !email ||
      !invoice.invoiceNo ||
      invoice.status === EInvoiceStatus.CANCELLED
    )
      return;
    const attempt = await this.startAttempt(
      invoice,
      EInvoiceAttemptOperation.SEND_EMAIL,
      VIETTEL_ENDPOINTS.sendEmailToCustomer.path,
    );
    const started = Date.now();
    try {
      await this.provider.sendInvoiceEmail({
        supplierTaxCode: invoice.supplierTaxCode,
        transactionUuid: invoice.transactionUuid,
        buyerEmail: email,
      });
      await this.events.save(
        this.events.create({
          invoiceId,
          eventType: 'EMAIL_SENT',
          payload: { recipient: email.replace(/(^.).*(@.*$)/, '$1***$2') },
        }),
      );
      await this.invoices.update(
        { id: invoiceId },
        { emailSentAt: new Date() },
      );
      await this.completeAttempt(attempt, started);
    } catch (error) {
      await this.fail(invoice, attempt, error, started);
    }
  }

  /**
   * One 7.21 lookup per sync: a draft waits for the accountant, possibly for
   * days, so not being signed yet is a normal answer and nothing is rescheduled.
   */
  private async syncDraft(invoice: EInvoice): Promise<void> {
    const attempt = await this.startAttempt(
      invoice,
      EInvoiceAttemptOperation.RECONCILE,
      VIETTEL_ENDPOINTS.byTransactionUuid.path,
    );
    const started = Date.now();
    try {
      const found = await this.findAtProvider(invoice);
      invoice.errorCode = null;
      invoice.errorDescription = null;
      if (found?.invoiceNo) {
        invoice.invoiceNo = found.invoiceNo;
        invoice.reservationCode =
          found.reservationCode ?? invoice.reservationCode;
        invoice.transactionId = found.transactionID || invoice.transactionId;
        invoice.codeOfTax = found.codeOfTax ?? invoice.codeOfTax;
        await this.events.save(
          this.events.create({
            invoiceId: invoice.id,
            eventType: 'DRAFT_SIGNED_AT_PROVIDER',
            payload: { invoiceNo: found.invoiceNo },
          }),
        );
        await this.markIssuedAndQueueFiles(invoice);
      } else {
        await this.invoices.save(invoice);
      }
      await this.completeAttempt(attempt, started);
    } catch (error) {
      await this.fail(invoice, attempt, error, started);
    }
  }

  /**
   * 7.21 lookup before re-sending 7.2: after a timeout, or once Viettel has
   * accepted the transactionUuid, sending 7.2 again risks a second invoice.
   */
  private async findAtProvider(
    invoice: EInvoice,
  ): Promise<ViettelTransactionSearchResult | null> {
    try {
      const found = await this.provider.getInvoiceByTransactionUuid(
        invoice.supplierTaxCode,
        invoice.transactionUuid,
      );
      return found.invoiceNo || found.transactionID || found.exists
        ? found
        : null;
    } catch (error) {
      // Viettel answers an unknown transactionUuid with a business error;
      // anything retryable must not fall through to a fresh 7.2.
      if (error instanceof ViettelSinvoiceException && !error.retryable)
        return null;
      throw error;
    }
  }

  private async applyIssueResult(
    invoice: EInvoice,
    result: Pick<
      ViettelTransactionSearchResult,
      'invoiceNo' | 'transactionID' | 'reservationCode' | 'codeOfTax'
    >,
  ): Promise<void> {
    invoice.transactionId = result.transactionID || invoice.transactionId;
    invoice.reservationCode = result.reservationCode ?? invoice.reservationCode;
    invoice.codeOfTax = result.codeOfTax ?? invoice.codeOfTax;
    invoice.invoiceNo = result.invoiceNo || null;
    invoice.errorCode = null;
    invoice.errorDescription = null;
    if (invoice.invoiceNo) {
      await this.markIssuedAndQueueFiles(invoice);
      return;
    }
    invoice.status = EInvoiceStatus.WAITING_INVOICE_NUMBER;
    await this.invoices.save(invoice);
    await this.scheduleReconcile(invoice.id, invoice.reconciliationAttempts);
  }

  private async applyDraftResult(
    invoice: EInvoice,
    result: Partial<
      Pick<
        ViettelTransactionSearchResult,
        'invoiceNo' | 'transactionID' | 'reservationCode' | 'codeOfTax'
      >
    >,
  ): Promise<void> {
    // Already signed on the portal (a retry found it): follow the issued path.
    if (result.invoiceNo) {
      await this.applyIssueResult(invoice, {
        invoiceNo: result.invoiceNo,
        transactionID: result.transactionID ?? '',
        reservationCode: result.reservationCode,
        codeOfTax: result.codeOfTax,
      });
      return;
    }
    invoice.transactionId = result.transactionID || invoice.transactionId;
    invoice.errorCode = null;
    invoice.errorDescription = null;
    invoice.status = EInvoiceStatus.DRAFT;
    await this.invoices.save(invoice);
    await this.events.save(
      this.events.create({
        invoiceId: invoice.id,
        eventType: 'DRAFT_CREATED',
        payload: { transactionID: invoice.transactionId },
      }),
    );
  }

  private async scheduleReconcile(
    invoiceId: string,
    index: number,
  ): Promise<void> {
    await this.reconcileQueue.add(
      E_INVOICE_JOBS.RECONCILE,
      { invoiceId },
      {
        delay: RECONCILIATION_DELAYS[index],
        jobId: `reconcile-${invoiceId}-${index}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: true,
        removeOnFail: 5000,
      },
    );
  }

  private async loadInvoice(id: string): Promise<EInvoice> {
    return this.invoices.findOneOrFail({
      where: { id },
      relations: { receipt: { items: true }, student: true },
    });
  }

  private async markIssuedAndQueueFiles(invoice: EInvoice): Promise<void> {
    invoice.status = EInvoiceStatus.ISSUED;
    invoice.issuedAt = new Date();
    await this.invoices.save(invoice);
    for (const fileType of ['PDF', 'ZIP'] as const) {
      await this.downloadQueue.add(
        E_INVOICE_JOBS.DOWNLOAD,
        { invoiceId: invoice.id, fileType },
        {
          delay: 5_000,
          attempts: 5,
          backoff: { type: 'exponential', delay: 10_000 },
          removeOnComplete: true,
        },
      );
    }
  }

  private startAttempt(
    invoice: EInvoice,
    operation: EInvoiceAttemptOperation,
    endpoint: string,
  ): Promise<EInvoiceAttempt> {
    return this.attempts.save(
      this.attempts.create({
        invoiceId: invoice.id,
        operation,
        status: EInvoiceAttemptStatus.STARTED,
        requestId: randomUUID(),
        endpoint,
        httpStatus: null,
        errorCode: null,
        errorDescription: null,
        retryable: false,
        durationMs: null,
      }),
    );
  }

  private async completeAttempt(
    attempt: EInvoiceAttempt,
    started: number,
  ): Promise<void> {
    attempt.status = EInvoiceAttemptStatus.SUCCEEDED;
    attempt.durationMs = Date.now() - started;
    await this.attempts.save(attempt);
  }

  private async fail(
    invoice: EInvoice,
    attempt: EInvoiceAttempt,
    error: unknown,
    started: number,
  ): Promise<void> {
    const mapped =
      error instanceof ViettelSinvoiceException
        ? error
        : new ViettelSinvoiceException(
            'UNKNOWN',
            null,
            null,
            error instanceof Error ? error.message : 'Unknown error',
            attempt.endpoint,
            invoice.transactionUuid,
            false,
          );
    attempt.status = EInvoiceAttemptStatus.FAILED;
    attempt.httpStatus = mapped.httpStatus;
    attempt.errorCode = mapped.viettelCode ?? mapped.kind;
    attempt.errorDescription = mapped.viettelMessage;
    attempt.retryable = mapped.retryable;
    attempt.durationMs = Date.now() - started;
    await this.attempts.save(attempt);
    if (attempt.operation === EInvoiceAttemptOperation.ISSUE) {
      invoice.status = mapped.retryable
        ? EInvoiceStatus.QUEUED
        : EInvoiceStatus.FAILED;
    } else if (
      attempt.operation === EInvoiceAttemptOperation.RECONCILE &&
      invoice.status !== EInvoiceStatus.DRAFT
    ) {
      invoice.status = mapped.retryable
        ? EInvoiceStatus.WAITING_INVOICE_NUMBER
        : EInvoiceStatus.FAILED;
    } else if (attempt.operation === EInvoiceAttemptOperation.DOWNLOAD) {
      if (!FILE_STAGE.includes(invoice.status)) {
        if (mapped.retryable) throw mapped;
        return;
      }
      invoice.status = EInvoiceStatus.FILE_PENDING;
    }
    invoice.errorCode = mapped.viettelCode ?? mapped.kind;
    invoice.errorDescription = mapped.viettelMessage;
    await this.invoices.save(invoice);
    if (mapped.retryable) throw mapped;
  }
}
