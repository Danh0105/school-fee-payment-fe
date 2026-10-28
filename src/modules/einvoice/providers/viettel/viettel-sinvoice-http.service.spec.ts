/* eslint-disable @typescript-eslint/unbound-method */
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ViettelSinvoiceAuthService } from './viettel-sinvoice-auth.service';
import { ViettelSinvoiceHttpService } from './viettel-sinvoice-http.service';
import { VIETTEL_ENDPOINTS } from './viettel-sinvoice.constants';

describe('ViettelSinvoiceHttpService', () => {
  const axiosRef = { request: jest.fn() };
  const auth = {
    getHeaders: jest.fn().mockResolvedValue({ Cookie: 'access_token=masked' }),
    invalidate: jest.fn(),
  } as unknown as ViettelSinvoiceAuthService;
  const config = new ConfigService({
    viettelSinvoice: { baseUrl: 'https://example.test/api/', timeout: 90_000 },
  });
  const service = new ViettelSinvoiceHttpService(
    { axiosRef } as unknown as HttpService,
    auth,
    config,
  );

  beforeEach(() => jest.clearAllMocks());

  it('retry auth đúng một lần khi 401', async () => {
    axiosRef.request
      .mockRejectedValueOnce({ response: { status: 401, data: {} } })
      .mockResolvedValueOnce({ status: 200, data: { ok: true } });
    await expect(
      service.request({ endpoint: VIETTEL_ENDPOINTS.customFields }),
    ).resolves.toEqual({ ok: true });
    expect(auth.invalidate).toHaveBeenCalledTimes(1);
    expect(axiosRef.request).toHaveBeenCalledTimes(2);
  });

  it('timeout là lỗi retryable', async () => {
    axiosRef.request.mockRejectedValue({ code: 'ETIMEDOUT' });
    await expect(
      service.request({ endpoint: VIETTEL_ENDPOINTS.issue }),
    ).rejects.toMatchObject({ kind: 'TIMEOUT', retryable: true });
  });

  it('Viettel 500 là lỗi retryable', async () => {
    axiosRef.request.mockRejectedValue({
      response: { status: 500, data: { errorCode: 'SERVER_ERROR' } },
    });
    await expect(
      service.request({ endpoint: VIETTEL_ENDPOINTS.issue }),
    ).rejects.toMatchObject({
      kind: 'VIETTEL_5XX',
      retryable: true,
      viettelCode: 'SERVER_ERROR',
    });
  });

  it('Viettel 500 "GENERAL" giữ lý do trong data và ghi log body', async () => {
    const warn = jest
      .spyOn(
        (service as unknown as { logger: { warn: (m: string) => void } })
          .logger,
        'warn',
      )
      .mockImplementation(() => undefined);
    axiosRef.request.mockRejectedValue({
      response: {
        status: 500,
        data: { message: 'GENERAL', data: 'Ký hiệu hóa đơn không hợp lệ' },
      },
    });
    await expect(
      service.request({ endpoint: VIETTEL_ENDPOINTS.draft }),
    ).rejects.toMatchObject({
      kind: 'VIETTEL_5XX',
      viettelMessage: 'GENERAL: Ký hiệu hóa đơn không hợp lệ',
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Ký hiệu hóa đơn không hợp lệ'),
    );
    warn.mockRestore();
  });

  it('validation 400 không retry', async () => {
    axiosRef.request.mockRejectedValue({
      response: {
        status: 400,
        data: { errorCode: 'VAT_AMOUNT_INVALID', description: 'invalid' },
      },
    });
    await expect(
      service.request({ endpoint: VIETTEL_ENDPOINTS.issue }),
    ).rejects.toMatchObject({ kind: 'VALIDATION_ERROR', retryable: false });
  });

  it('form-urlencoded bỏ field null/undefined và stringify boolean', async () => {
    axiosRef.request.mockResolvedValue({ status: 200, data: { ok: true } });
    await service.request({
      endpoint: VIETTEL_ENDPOINTS.cancel,
      data: {
        supplierTaxCode: '0101',
        invoiceNo: '1',
        optional: undefined,
        paid: false,
      },
    });
    const [[request]] = axiosRef.request.mock.calls as [
      [{ data: URLSearchParams }],
    ];
    expect(request.data.toString()).toBe(
      'supplierTaxCode=0101&invoiceNo=1&paid=false',
    );
  });
});
