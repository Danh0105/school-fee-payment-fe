/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment */
import { ConfigService } from '@nestjs/config';
import { ViettelInvoicePayloadDto } from './dto/invoice-payload.dto';
import { ViettelSinvoiceException } from './exceptions/viettel-sinvoice.exception';
import { ViettelSinvoiceHttpService } from './viettel-sinvoice-http.service';
import { ViettelSinvoiceService } from './viettel-sinvoice.service';

describe('ViettelSinvoiceService', () => {
  const http = { request: jest.fn() } as unknown as ViettelSinvoiceHttpService;
  const config = new ConfigService({
    viettelSinvoice: {
      endpointMethods: {
        createInvoiceWithCode: 'POST',
        getAllInvoiceTemplates: 'POST',
        getAllInvoices: 'POST',
        getInvoicesAll: 'POST',
      },
    },
  });
  const service = new ViettelSinvoiceService(http, config);
  const payload = {
    generalInvoiceInfo: {
      transactionUuid: '5f8bf423-5002-4dcf-9ca9-16853328eabe',
    },
  } as ViettelInvoicePayloadDto;

  beforeEach(() => jest.clearAllMocks());

  it('phát hành và map result thành công', async () => {
    (http.request as jest.Mock).mockResolvedValue({
      result: {
        supplierTaxCode: '0101',
        invoiceNo: '000001',
        transactionID: 'tx-1',
      },
    });
    await expect(service.issueInvoice(payload, '0101')).resolves.toMatchObject({
      invoiceNo: '000001',
      transactionID: 'tx-1',
    });
  });

  it('chấp nhận response phát hành trả trực tiếp không bọc result', async () => {
    (http.request as jest.Mock).mockResolvedValue({
      errorCode: null,
      supplierTaxCode: '0101',
      invoiceNo: '000002',
      transactionID: 'tx-2',
    });
    await expect(service.issueInvoice(payload, '0101')).resolves.toMatchObject({
      invoiceNo: '000002',
      transactionID: 'tx-2',
    });
  });

  it('giữ nguyên invoiceNo rỗng để workflow đối soát', async () => {
    (http.request as jest.Mock).mockResolvedValue({
      result: { supplierTaxCode: '0101', invoiceNo: '', transactionID: 'tx-1' },
    });
    await expect(service.issueInvoice(payload, '0101')).resolves.toMatchObject({
      invoiceNo: '',
    });
  });

  it('tra cứu 7.21 bằng đúng transactionUuid', async () => {
    (http.request as jest.Mock).mockResolvedValue({ invoiceNo: '000001' });
    await service.getInvoiceByTransactionUuid(
      '0101',
      payload.generalInvoiceInfo.transactionUuid,
    );
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          supplierTaxCode: '0101',
          transactionUuid: payload.generalInvoiceInfo.transactionUuid,
        },
        transactionUuid: payload.generalInvoiceInfo.transactionUuid,
      }),
    );
  });

  it('chuẩn hóa result[] thực tế của 7.21 thành một hóa đơn', async () => {
    (http.request as jest.Mock).mockResolvedValue({
      errorCode: null,
      transactionUuid: payload.generalInvoiceInfo.transactionUuid,
      result: [
        {
          supplierTaxCode: '0101',
          invoiceNo: 'K26TXM2813',
          reservationCode: 'CODE',
          status: 'Hóa đơn gốc',
        },
      ],
    });
    await expect(
      service.getInvoiceByTransactionUuid(
        '0101',
        payload.generalInvoiceInfo.transactionUuid,
      ),
    ).resolves.toMatchObject({
      invoiceNo: 'K26TXM2813',
      reservationCode: 'CODE',
    });
  });

  it('7.21 của nháp chưa ký (chỉ có ký hiệu, chưa có số) không bị coi là số hóa đơn', async () => {
    // Phản hồi thật của Viettel production cho một nháp 7.8 (15/10/2026).
    (http.request as jest.Mock).mockResolvedValue({
      errorCode: null,
      result: [
        {
          supplierTaxCode: '0316660845',
          invoiceNo: 'C21TIS',
          reservationCode: null,
          issueDate: 1792031530000,
          status: 'Hóa đơn gốc',
          exchangeStatus: null,
          exchangeDes: null,
          codeOfTax: null,
        },
      ],
    });
    await expect(
      service.getInvoiceByTransactionUuid(
        '0316660845',
        payload.generalInvoiceInfo.transactionUuid,
      ),
    ).resolves.toMatchObject({ invoiceNo: '', exists: true });
  });

  it('7.2 trả ký hiệu không kèm số thì coi như chưa cấp số', async () => {
    (http.request as jest.Mock).mockResolvedValue({
      result: { invoiceNo: 'C26TIS', transactionID: 'tx-1' },
    });
    await expect(service.issueInvoice(payload, '0101')).resolves.toMatchObject({
      invoiceNo: '',
      transactionID: 'tx-1',
    });
  });

  it('tạo nháp 7.8 gửi đúng payload và transactionUuid', async () => {
    (http.request as jest.Mock).mockResolvedValue({});
    await expect(
      service.createOrUpdateInvoiceDraft(payload, '0101'),
    ).resolves.toEqual({});
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: expect.objectContaining({
          path: 'InvoiceAPI/InvoiceWS/createOrUpdateInvoiceDraft/{supplierTaxCode}',
        }),
        data: payload,
        pathParams: { supplierTaxCode: '0101' },
        transactionUuid: payload.generalInvoiceInfo.transactionUuid,
      }),
    );
  });

  it('coi result[] rỗng của 7.21 là hóa đơn chưa sẵn sàng', async () => {
    (http.request as jest.Mock).mockResolvedValue({
      errorCode: null,
      result: [],
    });
    await expect(
      service.getInvoiceByTransactionUuid(
        '0101',
        payload.generalInvoiceInfo.transactionUuid,
      ),
    ).resolves.toEqual({ invoiceNo: '' });
  });

  it('7.21 lỗi 5xx thì tìm hóa đơn đã phát hành qua danh sách 7.6', async () => {
    (http.request as jest.Mock)
      .mockRejectedValueOnce(
        new ViettelSinvoiceException(
          'VIETTEL_5XX',
          500,
          null,
          'GENERAL',
          'searchInvoiceByTransactionUuid',
          payload.generalInvoiceInfo.transactionUuid,
          true,
        ),
      )
      .mockResolvedValueOnce({
        errorCode: null,
        totalRows: 1,
        invoices: [
          {
            invoiceNo: 'C26TIS16096',
            issueDateStr: '2026-10-28T08:09:12Z',
            transactionUuid: payload.generalInvoiceInfo.transactionUuid,
          },
        ],
      });

    await expect(
      service.getInvoiceByTransactionUuid(
        '0316660845',
        payload.generalInvoiceInfo.transactionUuid,
      ),
    ).resolves.toMatchObject({
      invoiceNo: 'C26TIS16096',
      issueDate: '2026-10-28T08:09:12Z',
      exists: true,
    });
    expect(http.request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        endpoint: expect.objectContaining({
          path: 'InvoiceAPI/InvoiceUtilsWS/getInvoices/{supplierTaxCode}',
        }),
        data: expect.objectContaining({
          pageNum: 1,
          rowPerPage: 1000,
        }),
      }),
    );
  });

  it('7.21 lỗi 5xx và 7.6 chỉ thấy nháp thì vẫn nhận diện bản ghi Viettel', async () => {
    (http.request as jest.Mock)
      .mockRejectedValueOnce(
        new ViettelSinvoiceException(
          'VIETTEL_5XX',
          500,
          null,
          'GENERAL',
          'searchInvoiceByTransactionUuid',
          payload.generalInvoiceInfo.transactionUuid,
          true,
        ),
      )
      .mockResolvedValueOnce({
        totalRows: 1,
        invoices: [
          {
            invoiceNo: 'C26TIS',
            transactionUuid: payload.generalInvoiceInfo.transactionUuid,
          },
        ],
      });

    await expect(
      service.getInvoiceByTransactionUuid(
        '0316660845',
        payload.generalInvoiceInfo.transactionUuid,
      ),
    ).resolves.toEqual({
      invoiceNo: '',
      reservationCode: undefined,
      codeOfTax: undefined,
      issueDate: undefined,
      exists: true,
    });
  });

  it('7.21 lỗi 5xx nhưng 7.6 hoạt động và không thấy UUID thì báo lookup suy giảm', async () => {
    (http.request as jest.Mock)
      .mockRejectedValueOnce(
        new ViettelSinvoiceException(
          'VIETTEL_5XX',
          500,
          null,
          'GENERAL',
          'searchInvoiceByTransactionUuid',
          payload.generalInvoiceInfo.transactionUuid,
          true,
        ),
      )
      .mockResolvedValueOnce({ totalRows: 0, invoices: [] });

    await expect(
      service.getInvoiceByTransactionUuid(
        '0316660845',
        payload.generalInvoiceInfo.transactionUuid,
      ),
    ).resolves.toEqual({ invoiceNo: '', lookupDegraded: true });
  });

  it.each(['PDF', 'ZIP'] as const)('lấy file %s', async (fileType) => {
    (http.request as jest.Mock).mockResolvedValue({
      fileName: `invoice.${fileType.toLowerCase()}`,
      fileToBytes: 'ZmlsZQ==',
    });
    await expect(
      service.getInvoiceRepresentationFile({
        supplierTaxCode: '0101',
        invoiceNo: '1',
        templateCode: 'T',
        fileType,
      }),
    ).resolves.toMatchObject({ fileToBytes: 'ZmlsZQ==' });
  });

  it('gửi email khách hàng bằng 7.33', async () => {
    (http.request as jest.Mock).mockResolvedValue({ code: null });
    await service.sendEmailToCustomer({
      supplierTaxCode: '0101',
      transactionUuid: 'uuid',
      buyerEmail: 'parent@example.com',
    });
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ buyerEmail: 'parent@example.com' }),
      }),
    );
  });

  it('không coi code HTTP thành công trong body là lỗi nghiệp vụ', async () => {
    (http.request as jest.Mock).mockResolvedValue({
      code: 200,
      message: 'OK',
      data: { sent: true },
    });
    await expect(
      service.sendEmailToCustomer({
        supplierTaxCode: '0101',
        transactionUuid: 'uuid',
        buyerEmail: 'parent@example.com',
      }),
    ).resolves.toEqual({ sent: true });
  });

  it('ném lỗi khi API hủy trả business error trên HTTP 200', async () => {
    (http.request as jest.Mock).mockResolvedValue({
      errorCode: 'INVOICE_NOT_FOUND',
      description: 'Không tìm thấy hóa đơn',
    });
    await expect(
      service.cancelInvoice({
        supplierTaxCode: '0101',
        invoiceNo: '1',
        strIssueDate: '23/09/2026',
        additionalReferenceDesc: 'Sai',
        additionalReferenceDate: '23/09/2026',
      }),
    ).rejects.toMatchObject({ viettelCode: 'INVOICE_NOT_FOUND' });
  });

  it('hủy hóa đơn bằng form endpoint 7.9', async () => {
    (http.request as jest.Mock).mockResolvedValue({ errorCode: null });
    await service.cancelInvoice({
      supplierTaxCode: '0101',
      invoiceNo: '1',
      strIssueDate: '23/09/2026',
      additionalReferenceDesc: 'Sai',
      additionalReferenceDate: '23/09/2026',
    });
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: expect.objectContaining({
          contentType: 'application/x-www-form-urlencoded',
        }),
      }),
    );
  });

  it('cập nhật và hủy trạng thái thanh toán', async () => {
    (http.request as jest.Mock).mockResolvedValue({ errorCode: null });
    const dto = {
      supplierTaxCode: '0101',
      invoiceNo: '1',
      strIssueDate: '23/09/2026',
    };
    await service.updatePaymentStatus(dto);
    await service.cancelPaymentStatus(dto);
    expect(http.request).toHaveBeenCalledTimes(2);
  });

  it('thực hiện USB Token hash/sign qua đúng hai endpoint', async () => {
    (http.request as jest.Mock).mockResolvedValue({});
    await service.getUsbTokenHash(payload, '0101');
    await service.submitUsbTokenSignature({
      supplierTaxCode: '0101',
      templateCode: 'T',
      hashString: 'hash',
      signature: 'signature',
    });
    expect(http.request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        endpoint: expect.objectContaining({ section: '7.15/7.30' }),
      }),
    );
    expect(http.request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        endpoint: expect.objectContaining({ section: '7.16/7.31' }),
      }),
    );
  });

  it('Cloud CA tái sử dụng transport hash/sign nhưng tách method nghiệp vụ', async () => {
    (http.request as jest.Mock).mockResolvedValue({});
    await service.getCloudCaHash(payload, '0101');
    await service.submitCloudCaSignature({
      supplierTaxCode: '0101',
      templateCode: 'T',
      hashString: 'hash',
      signature: 'signature',
    });
    expect(http.request).toHaveBeenCalledTimes(2);
  });

  it('cấp reservation code và gửi hóa đơn sang CQT', async () => {
    (http.request as jest.Mock).mockResolvedValue({});
    await service.getReservationCodes('0101', { requestCode: 'REQ' });
    await service.sendInvoiceToTaxAuthority({
      supplierTaxCode: '0101',
      transactionUuid: 'uuid',
      startDate: '01/09/2026',
      endDate: '23/09/2026',
    });
    expect(http.request).toHaveBeenCalledTimes(2);
  });

  it('không tự invent method khi config endpoint chưa được xác minh', async () => {
    const unverified = new ViettelSinvoiceService(
      http,
      new ConfigService({ viettelSinvoice: { endpointMethods: {} } }),
    );
    await unverified.getAllInvoiceTemplates({
      taxCode: '0101',
      invoiceType: '1',
    });
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({ methodOverride: undefined }),
    );
  });
});
