/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */
import { ConfigService } from '@nestjs/config';
import { EInvoiceWorkflowService } from './einvoice-workflow.service';
import { EInvoiceIssueMode, EInvoiceStatus } from '../entities/einvoice.enums';
import { ViettelSinvoiceException } from '../providers/viettel/exceptions/viettel-sinvoice.exception';

describe('EInvoiceWorkflowService', () => {
  const uuid = '5f8bf423-5002-4dcf-9ca9-16853328eabe';
  let invoice: Record<string, unknown>;
  let invoices: Record<string, jest.Mock>;
  let provider: Record<string, jest.Mock>;
  let reconcileQueue: { add: jest.Mock };
  let downloadQueue: { add: jest.Mock };
  let mapper: { fromReceipt: jest.Mock };
  let config: Record<string, unknown>;
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
    config = {};
    provider = {
      issueInvoice: jest.fn(),
      createOrUpdateInvoiceDraft: jest.fn(),
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
      {
        findOneByOrFail: jest.fn().mockImplementation(async () => config),
      } as never,
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
      { findOne: jest.fn().mockResolvedValue(null) } as never,
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

  it('7.6 không thấy hóa đơn khi 7.21 lỗi thì không gửi lại 7.2', async () => {
    provider.issueInvoice.mockRejectedValueOnce(timeout());
    await expect(service.issue('invoice-id')).rejects.toMatchObject({
      kind: 'TIMEOUT',
    });
    provider.getInvoiceByTransactionUuid.mockResolvedValue({
      invoiceNo: '',
      lookupDegraded: true,
    });
    await service.issue('invoice-id');
    expect(provider.issueInvoice).toHaveBeenCalledTimes(1);
    expect(invoice.status).toBe(EInvoiceStatus.WAITING_INVOICE_NUMBER);
  });

  it('atomic claim ngăn hai worker phát hành song song', async () => {
    invoices.update.mockResolvedValue({ affected: 0 });
    await service.issue('invoice-id');
    expect(provider.issueInvoice).not.toHaveBeenCalled();
  });

  it('gửi hóa đơn tới email phụ huynh đăng ký trên đơn (ưu tiên hơn email hồ sơ học sinh) và ghi emailSentAt', async () => {
    Object.assign(invoice, {
      status: EInvoiceStatus.COMPLETED,
      invoiceNo: 'C26TIS12',
      buyerEmail: 'dangky@example.com',
    });
    provider.sendInvoiceEmail.mockResolvedValue({});
    await service.sendEmail('invoice-id');
    expect(provider.sendInvoiceEmail).toHaveBeenCalledWith({
      supplierTaxCode: '0101',
      transactionUuid: uuid,
      buyerEmail: 'dangky@example.com',
    });
    const [where, changes] = invoices.update.mock.calls.at(-1) as [
      unknown,
      { emailSentAt: unknown },
    ];
    expect(where).toEqual({ id: 'invoice-id' });
    expect(changes.emailSentAt).toBeInstanceOf(Date);
  });

  it('chưa phát hành (chưa có số) thì không gửi email', async () => {
    invoice.buyerEmail = 'dangky@example.com';
    await service.sendEmail('invoice-id');
    expect(provider.sendInvoiceEmail).not.toHaveBeenCalled();
  });

  describe('chế độ nháp (7.8)', () => {
    const notFound = () =>
      new ViettelSinvoiceException(
        'VALIDATION_ERROR',
        null,
        'NOT_FOUND',
        'not found',
        'searchInvoiceByTransactionUuid',
        uuid,
        false,
      );

    beforeEach(() => {
      config.issueMode = EInvoiceIssueMode.DRAFT;
    });

    it('tạo nháp bằng 7.8, không gọi 7.2, không chờ số, không tải file', async () => {
      provider.createOrUpdateInvoiceDraft.mockResolvedValue({
        invoiceNo: '',
        transactionID: 'tx-draft',
      });
      await service.issue('invoice-id');
      expect(provider.createOrUpdateInvoiceDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          generalInvoiceInfo: { transactionUuid: uuid },
        }),
        '0101',
      );
      expect(provider.issueInvoice).not.toHaveBeenCalled();
      expect(invoice).toMatchObject({
        status: EInvoiceStatus.DRAFT,
        transactionId: 'tx-draft',
        invoiceNo: null,
      });
      expect(reconcileQueue.add).not.toHaveBeenCalled();
      expect(downloadQueue.add).not.toHaveBeenCalled();
    });

    it('timeout khi tạo nháp: lần thử lại thấy nháp trên Viettel thì không gửi 7.8 lần nữa', async () => {
      provider.createOrUpdateInvoiceDraft.mockRejectedValueOnce(timeout());
      await expect(service.issue('invoice-id')).rejects.toMatchObject({
        kind: 'TIMEOUT',
      });
      expect(invoice.status).toBe(EInvoiceStatus.QUEUED);
      provider.getInvoiceByTransactionUuid.mockResolvedValue({
        invoiceNo: '',
        transactionID: 'tx-draft',
      });
      await service.issue('invoice-id');
      expect(provider.createOrUpdateInvoiceDraft).toHaveBeenCalledTimes(1);
      expect(invoice.status).toBe(EInvoiceStatus.DRAFT);
    });

    it('7.6 không thấy nháp khi 7.21 lỗi thì upsert lại 7.8 cùng UUID', async () => {
      provider.createOrUpdateInvoiceDraft
        .mockRejectedValueOnce(timeout())
        .mockResolvedValueOnce({ invoiceNo: '', transactionID: 'tx-draft' });
      await expect(service.issue('invoice-id')).rejects.toMatchObject({
        kind: 'TIMEOUT',
      });
      provider.getInvoiceByTransactionUuid.mockResolvedValue({
        invoiceNo: '',
        lookupDegraded: true,
      });
      await service.issue('invoice-id');
      expect(provider.createOrUpdateInvoiceDraft).toHaveBeenCalledTimes(2);
      expect(
        provider.createOrUpdateInvoiceDraft.mock.calls[1][0].generalInvoiceInfo
          .transactionUuid,
      ).toBe(uuid);
      expect(invoice.status).toBe(EInvoiceStatus.DRAFT);
    });

    it('đồng bộ khi kế toán chưa ký: vẫn là nháp, không lên lịch tra tiếp', async () => {
      invoice.status = EInvoiceStatus.DRAFT;
      provider.getInvoiceByTransactionUuid.mockRejectedValue(notFound());
      await service.reconcile('invoice-id');
      expect(invoice.status).toBe(EInvoiceStatus.DRAFT);
      expect(reconcileQueue.add).not.toHaveBeenCalled();
      expect(downloadQueue.add).not.toHaveBeenCalled();
    });

    it('đồng bộ sau khi kế toán ký trên cổng: lấy số, chuyển ISSUED và tải PDF/ZIP', async () => {
      invoice.status = EInvoiceStatus.DRAFT;
      provider.getInvoiceByTransactionUuid.mockResolvedValue({
        invoiceNo: 'C26TIS0000001',
        transactionID: 'tx-draft',
        reservationCode: 'RC1',
      });
      await service.reconcile('invoice-id');
      expect(invoice).toMatchObject({
        status: EInvoiceStatus.ISSUED,
        invoiceNo: 'C26TIS0000001',
        reservationCode: 'RC1',
      });
      expect(downloadQueue.add).toHaveBeenCalledTimes(2);
    });

    it('đồng bộ lỗi mạng: giữ nháp và để BullMQ thử lại', async () => {
      invoice.status = EInvoiceStatus.DRAFT;
      provider.getInvoiceByTransactionUuid.mockRejectedValue(timeout());
      await expect(service.reconcile('invoice-id')).rejects.toMatchObject({
        kind: 'TIMEOUT',
      });
      expect(invoice.status).toBe(EInvoiceStatus.DRAFT);
    });
  });
});
