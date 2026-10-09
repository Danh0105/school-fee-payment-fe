/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */
import { ConfigService } from '@nestjs/config';
import { EInvoiceWorkflowService } from './einvoice-workflow.service';
import { EInvoiceStatus } from '../entities/einvoice.enums';
import { ViettelSinvoiceException } from '../providers/viettel/exceptions/viettel-sinvoice.exception';

describe('EInvoiceWorkflowService', () => {
  const uuid = '5f8bf423-5002-4dcf-9ca9-16853328eabe';
  let invoice: Record<string, unknown>;
  let invoices: Record<string, jest.Mock>;
  let provider: Record<string, jest.Mock>;
  let reconcileQueue: { add: jest.Mock };
  let downloadQueue: { add: jest.Mock };
  let mapper: { fromReceipt: jest.Mock };
  let service: EInvoiceWorkflowService;

  beforeEach(() => {
    invoice = {
      id: 'invoice-id',
      schoolId: 'school-id',
      supplierTaxCode: '0101',
      templateCode: 'T',
      invoiceSeries: 'C26TAA',
      transactionUuid: uuid,
      status: EInvoiceStatus.QUEUED,
      reconciliationAttempts: 0,
      receipt: { items: [] },
      student: { parentEmail: 'parent@example.com' },
      provider: 'VIETTEL',
      invoiceNo: null,
    };
    invoices = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findOneOrFail: jest.fn().mockImplementation(async () => invoice),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    provider = {
      issueInvoice: jest.fn(),
      getInvoiceByTransactionUuid: jest.fn(),
      getInvoiceFile: jest.fn(),
      sendInvoiceEmail: jest.fn(),
    };
    reconcileQueue = { add: jest.fn().mockResolvedValue(undefined) };
    downloadQueue = { add: jest.fn().mockResolvedValue(undefined) };
    mapper = {
      fromReceipt: jest.fn().mockReturnValue({
        generalInvoiceInfo: { transactionUuid: uuid },
      }),
    };
    const savedAttempts: Record<string, unknown>[] = [];
    const attempts = {
      create: jest.fn().mockImplementation((value) => value),
      save: jest
        .fn()
        .mockImplementation(async (value: Record<string, unknown>) => {
          if (!savedAttempts.includes(value)) savedAttempts.push(value);
          return value;
        }),
      exists: jest
        .fn()
        .mockImplementation(async () =>
          savedAttempts.some((a) => a.operation === 'ISSUE'),
        ),
    };
    service = new EInvoiceWorkflowService(
      invoices as never,
      { findOneByOrFail: jest.fn().mockResolvedValue({}) } as never,
      attempts as never,
      { count: jest.fn(), upsert: jest.fn() } as never,
      { create: jest.fn(), save: jest.fn() } as never,
      provider as never,
      mapper as never,
      new ConfigService({
        viettelSinvoice: { fileStoragePath: './storage/einvoices' },
      }),
      reconcileQueue as never,
      downloadQueue as never,
      { add: jest.fn() } as never,
    );
  });

  it('invoiceNo rỗng chuyển WAITING và enqueue 7.21 sau 30 giây', async () => {
    provider.issueInvoice.mockResolvedValue({
      invoiceNo: '',
      transactionID: 'tx-1',
    });
    await service.issue('invoice-id');
    expect(invoice.status).toBe(EInvoiceStatus.WAITING_INVOICE_NUMBER);
    expect(reconcileQueue.add).toHaveBeenCalledWith(
      'reconcile-invoice',
      { invoiceId: 'invoice-id' },
      expect.objectContaining({
        delay: 30_000,
        attempts: 5,
        backoff: { type: 'exponential', delay: 30_000 },
      }),
    );
  });

  it('lỗi mạng khi 7.21 giữ trạng thái chờ để BullMQ retry', async () => {
    invoice.status = EInvoiceStatus.WAITING_INVOICE_NUMBER;
    provider.getInvoiceByTransactionUuid.mockRejectedValue(
      new ViettelSinvoiceException(
        'NETWORK_ERROR',
        null,
        null,
        'network error',
        'searchInvoiceByTransactionUuid',
        uuid,
        true,
      ),
    );
    await expect(service.reconcile('invoice-id')).rejects.toMatchObject({
      kind: 'NETWORK_ERROR',
    });
    expect(invoice.status).toBe(EInvoiceStatus.WAITING_INVOICE_NUMBER);
  });

  it('phát hành có số hóa đơn enqueue cả PDF và ZIP', async () => {
    provider.issueInvoice.mockResolvedValue({
      invoiceNo: '000001',
      transactionID: 'tx-1',
    });
    await service.issue('invoice-id');
    expect(invoice.status).toBe(EInvoiceStatus.ISSUED);
    expect(downloadQueue.add).toHaveBeenCalledTimes(2);
    expect(downloadQueue.add).toHaveBeenCalledWith(
      'download-invoice',
      expect.objectContaining({ fileType: 'PDF' }),
      expect.any(Object),
    );
    expect(downloadQueue.add).toHaveBeenCalledWith(
      'download-invoice',
      expect.objectContaining({ fileType: 'ZIP' }),
      expect.any(Object),
    );
  });

  const timeout = () =>
    new ViettelSinvoiceException(
      'TIMEOUT',
      null,
      null,
      'timeout',
      'issue',
      uuid,
      true,
    );

  it('retry timeout dùng lại transactionUuid cũ', async () => {
    provider.issueInvoice
      .mockRejectedValueOnce(timeout())
      .mockResolvedValueOnce({ invoiceNo: '000001', transactionID: 'tx-1' });
    provider.getInvoiceByTransactionUuid.mockRejectedValue(
      new ViettelSinvoiceException(
        'VALIDATION_ERROR',
        null,
        'NOT_FOUND',
        'not found',
        'searchInvoiceByTransactionUuid',
        uuid,
        false,
      ),
    );
    await expect(service.issue('invoice-id')).rejects.toMatchObject({
      kind: 'TIMEOUT',
    });
    await service.issue('invoice-id');
    expect(provider.getInvoiceByTransactionUuid).toHaveBeenCalledTimes(1);
    expect(
      mapper.fromReceipt.mock.results[0].value.generalInvoiceInfo
        .transactionUuid,
    ).toBe(uuid);
    expect(
      mapper.fromReceipt.mock.results[1].value.generalInvoiceInfo
        .transactionUuid,
    ).toBe(uuid);
  });

  it('retry sau timeout tra 7.21 trước; Viettel đã có hóa đơn thì không gửi lại 7.2', async () => {
    provider.issueInvoice.mockRejectedValueOnce(timeout());
    await expect(service.issue('invoice-id')).rejects.toMatchObject({
      kind: 'TIMEOUT',
    });
    provider.getInvoiceByTransactionUuid.mockResolvedValue({
      invoiceNo: '000001',
      transactionID: 'tx-1',
    });
    await service.issue('invoice-id');
    expect(provider.issueInvoice).toHaveBeenCalledTimes(1);
    expect(invoice).toMatchObject({
      status: EInvoiceStatus.ISSUED,
      invoiceNo: '000001',
      transactionId: 'tx-1',
    });
  });

  it('không tra được 7.21 (lỗi mạng) thì không gửi lại 7.2', async () => {
    provider.issueInvoice.mockRejectedValueOnce(timeout());
    await expect(service.issue('invoice-id')).rejects.toMatchObject({
      kind: 'TIMEOUT',
    });
    provider.getInvoiceByTransactionUuid.mockRejectedValue(timeout());
    await expect(service.issue('invoice-id')).rejects.toMatchObject({
      kind: 'TIMEOUT',
    });
    expect(provider.issueInvoice).toHaveBeenCalledTimes(1);
    expect(invoice.status).toBe(EInvoiceStatus.QUEUED);
  });

  it('atomic claim ngăn hai worker phát hành song song', async () => {
    invoices.update.mockResolvedValue({ affected: 0 });
    await service.issue('invoice-id');
    expect(provider.issueInvoice).not.toHaveBeenCalled();
  });
});
