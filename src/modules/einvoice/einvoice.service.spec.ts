import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import JSZip from 'jszip';
import { ReceiptStatus } from '../../common/enums/status.enum';
import { Receipt } from '../../receipts/entities/receipt.entity';
import { QueryEInvoiceDto } from './dto/query-einvoice.dto';
import { EInvoiceService } from './einvoice.service';
import { EInvoice } from './entities/einvoice.entity';
import { EInvoiceConfig } from './entities/einvoice-config.entity';
import { EInvoiceEvent } from './entities/einvoice-event.entity';
import { EInvoiceStatus } from './entities/einvoice.enums';

describe('EInvoiceService idempotency', () => {
  it('hai lần prepare cùng payment luôn trả bản ghi và transactionUuid cũ', async () => {
    const existing = {
      id: 'invoice-id',
      paymentId: 'payment-id',
      transactionUuid: '5f8bf423-5002-4dcf-9ca9-16853328eabe',
      status: EInvoiceStatus.PENDING,
    };
    const queryBuilder = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ identifiers: [] }),
    };
    const invoiceRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      findOneOrFail: jest.fn().mockResolvedValue(existing),
    };
    const configRepo = {
      findOne: jest.fn().mockResolvedValue({
        enabled: true,
        autoIssue: true,
        provider: 'VIETTEL',
        supplierTaxCode: '0101',
        templateCode: 'T',
        invoiceSeries: 'C26TAA',
      }),
    };
    const eventRepo = { insert: jest.fn().mockResolvedValue({}) };
    const manager = {
      getRepository: jest.fn().mockImplementation((entity: unknown) => {
        if (entity === EInvoiceConfig) return configRepo;
        if (entity === EInvoice) return invoiceRepo;
        if (entity === EInvoiceEvent) return eventRepo;
        throw new Error('Unexpected repository');
      }),
    };
    const service = new EInvoiceService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new ConfigService({
        viettelSinvoice: { enabled: true, autoIssue: true },
      }),
    );
    const input = {
      schoolId: 'school-id',
      paymentId: 'payment-id',
      receiptId: 'receipt-id',
      studentId: 'student-id',
    };

    const first = await service.prepareForReceipt(input, manager as never);
    const second = await service.prepareForReceipt(input, manager as never);

    expect(first?.transactionUuid).toBe(existing.transactionUuid);
    expect(second?.transactionUuid).toBe(existing.transactionUuid);
    expect(queryBuilder.orIgnore).toHaveBeenCalledTimes(2);
  });

  it('không tạo job trùng khi invoice đã được worker khác claim', async () => {
    const invoices = {
      update: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    const issueQueue = { add: jest.fn() };
    const service = new EInvoiceService(
      invoices as never,
      {} as never,
      {} as never,
      {} as never,
      issueQueue as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new ConfigService({}),
    );

    await service.enqueueIssue('invoice-id');

    expect(issueQueue.add).not.toHaveBeenCalled();
  });

  it('trả trạng thái về PENDING khi Redis không nhận được job', async () => {
    const invoices = {
      update: jest
        .fn()
        .mockResolvedValueOnce({ affected: 1 })
        .mockResolvedValueOnce({ affected: 1 }),
    };
    const issueQueue = {
      add: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
    };
    const service = new EInvoiceService(
      invoices as never,
      {} as never,
      {} as never,
      {} as never,
      issueQueue as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new ConfigService({}),
    );

    await expect(service.enqueueIssue('invoice-id')).rejects.toThrow(
      'Redis unavailable',
    );
    expect(invoices.update).toHaveBeenNthCalledWith(
      2,
      { id: 'invoice-id', status: EInvoiceStatus.QUEUED },
      { status: EInvoiceStatus.PENDING },
    );
  });
});

describe('EInvoiceService xuất hóa đơn thủ công theo phiếu thu', () => {
  const receipt = {
    id: 'receipt-id',
    schoolId: 'school-id',
    studentId: 'student-id',
    paymentTransactionId: 'payment-id',
    status: ReceiptStatus.ISSUED,
  };
  const config = {
    enabled: true,
    autoIssue: false,
    provider: 'VIETTEL',
    supplierTaxCode: '0101',
    templateCode: 'T',
    invoiceSeries: 'C26TAA',
  };

  function build(options: {
    receipt?: Record<string, unknown> | null;
    alreadyInvoiced?: boolean;
    config?: Record<string, unknown> | null;
    insertSkipped?: boolean;
    globalEnabled?: boolean;
  }) {
    const queryBuilder = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ identifiers: [] }),
    };
    const invoiceRepo = {
      exists: jest.fn().mockResolvedValue(options.alreadyInvoiced ?? false),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      findOne: jest
        .fn()
        .mockResolvedValue(
          options.insertSkipped
            ? null
            : { id: 'invoice-id', status: EInvoiceStatus.PENDING },
        ),
    };
    const eventRepo = { insert: jest.fn().mockResolvedValue({}) };
    const repositories = new Map<unknown, unknown>([
      [
        Receipt,
        {
          findOne: jest
            .fn()
            .mockResolvedValue(
              options.receipt === undefined ? receipt : options.receipt,
            ),
        },
      ],
      [EInvoice, invoiceRepo],
      [
        EInvoiceConfig,
        {
          findOne: jest
            .fn()
            .mockResolvedValue(
              options.config === undefined ? config : options.config,
            ),
        },
      ],
      [EInvoiceEvent, eventRepo],
    ]);
    const txManager = {
      getRepository: jest.fn((entity: unknown) => repositories.get(entity)),
    };
    const invoices = {
      manager: {
        transaction: jest.fn(
          (work: (manager: typeof txManager) => Promise<unknown>) =>
            work(txManager),
        ),
      },
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const issueQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const service = new EInvoiceService(
      invoices as never,
      {} as never,
      {} as never,
      {} as never,
      issueQueue as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new ConfigService({
        viettelSinvoice: {
          enabled: options.globalEnabled ?? true,
          autoIssue: true,
        },
      }),
    );
    return { service, queryBuilder, eventRepo, invoices, issueQueue };
  }

  it('trường tắt tự động phát hành vẫn xuất được thủ công: tạo PENDING rồi đưa vào hàng đợi', async () => {
    const { service, queryBuilder, eventRepo, invoices, issueQueue } = build(
      {},
    );

    const invoice = await service.issueForReceipt('receipt-id');

    expect(invoice.id).toBe('invoice-id');
    expect(queryBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'school-id',
        paymentId: 'payment-id',
        receiptId: 'receipt-id',
        studentId: 'student-id',
        status: EInvoiceStatus.PENDING,
      }),
    );
    const [event] = eventRepo.insert.mock.calls[0] as [
      { eventType: string; payload: Record<string, unknown> },
    ];
    expect(event.eventType).toBe('INVOICE_PREPARED');
    expect(event.payload.manual).toBe(true);
    expect(invoices.update).toHaveBeenCalledWith(
      { id: 'invoice-id', status: EInvoiceStatus.PENDING },
      { status: EInvoiceStatus.QUEUED },
    );
    expect(issueQueue.add).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'tích hợp tắt trên máy chủ',
      { globalEnabled: false },
      'Tích hợp hóa đơn điện tử Viettel đang tắt trên máy chủ',
    ],
    ['không có phiếu thu', { receipt: null }, 'Không tìm thấy phiếu thu'],
    [
      'phiếu thu đã hủy',
      { receipt: { ...receipt, status: ReceiptStatus.CANCELLED } },
      'Phiếu thu đã hủy nên không thể xuất hóa đơn',
    ],
    [
      'phiếu thu không gắn giao dịch',
      { receipt: { ...receipt, paymentTransactionId: null } },
      'Phiếu thu không gắn với giao dịch thanh toán nên không thể xuất hóa đơn',
    ],
    [
      'phiếu thu đã có hóa đơn',
      { alreadyInvoiced: true },
      'Phiếu thu đã có hóa đơn điện tử',
    ],
    [
      'trường chưa bật hóa đơn điện tử',
      { config: { ...config, enabled: false } },
      'Trường chưa bật hóa đơn điện tử',
    ],
    [
      'giao dịch đã có hóa đơn khác',
      { insertSkipped: true },
      'Giao dịch của phiếu thu đã có hóa đơn điện tử khác',
    ],
  ])('%s → báo lỗi, không đưa vào hàng đợi', async (_, options, message) => {
    const { service, issueQueue } = build(options);

    await expect(service.issueForReceipt('receipt-id')).rejects.toThrow(
      message,
    );
    expect(issueQueue.add).not.toHaveBeenCalled();
  });
});

describe('EInvoiceService tải XML', () => {
  let directory: string;

  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'einvoice-xml-'));
  });
  afterAll(() => rmSync(directory, { recursive: true, force: true }));

  async function serviceWithZip(entries: Record<string, string> | null) {
    let storagePath: string | undefined;
    if (entries) {
      const zip = new JSZip();
      for (const [name, content] of Object.entries(entries))
        zip.file(name, content);
      storagePath = join(directory, `${Object.keys(entries).join('_')}.zip`);
      writeFileSync(
        storagePath,
        await zip.generateAsync({ type: 'nodebuffer' }),
      );
    }
    const files = {
      findOne: jest
        .fn()
        .mockResolvedValue(storagePath ? { storagePath } : null),
    };
    return new EInvoiceService(
      {} as never,
      {} as never,
      files as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new ConfigService({}),
    );
  }

  it('lấy file XML trong ZIP của Viettel', async () => {
    const service = await serviceWithZip({
      'K26TAA12.xml': '<HDon>12</HDon>',
      'K26TAA12.pdf': 'PDF',
    });

    const xml = await service.getXml('invoice-id');

    expect(xml?.fileName).toBe('K26TAA12.xml');
    expect(xml?.content.toString()).toBe('<HDon>12</HDon>');
  });

  it('chưa có ZIP → null để controller yêu cầu tải', async () => {
    const service = await serviceWithZip(null);

    await expect(service.getXml('invoice-id')).resolves.toBeNull();
  });

  it('ZIP không có XML → 404', async () => {
    const service = await serviceWithZip({ 'only.pdf': 'PDF' });

    await expect(service.getXml('invoice-id')).rejects.toThrow(
      'File ZIP của hóa đơn không chứa XML',
    );
  });
});

describe('EInvoiceService danh sách', () => {
  it('chỉ sắp xếp theo cột cho phép, cột lạ quay về createdAt', async () => {
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const service = new EInvoiceService(
      { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new ConfigService({}),
    );
    const query = (sortBy: string) =>
      Object.assign(new QueryEInvoiceDto(), { sortBy, sortOrder: 'ASC' });

    await service.findAll(query('issuedAt'), null);
    await service.findAll(query('constructor'), null);
    await service.findAll(query('i.id; DROP TABLE einvoices'), null);

    expect(queryBuilder.orderBy.mock.calls).toEqual([
      ['i.issuedAt', 'ASC'],
      ['i.createdAt', 'ASC'],
      ['i.createdAt', 'ASC'],
    ]);
  });
});
