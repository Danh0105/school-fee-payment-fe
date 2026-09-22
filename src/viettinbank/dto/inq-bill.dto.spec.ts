import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { InqBillRequestDto } from './inq-bill.dto';

/**
 * ValidationPipe runs globally with { whitelist: true, forbidNonWhitelisted:
 * true } (see main.ts) — any field VietinBank sends that isn't declared on
 * the DTO gets the *entire* request rejected with 400, before our
 * controller logic even runs. This locks in acceptance of a real inq-bill
 * request VietinBank sent in production, which 400'd because header.timestamp/
 * recordNum/version/language and data.channelId weren't declared (the doc's
 * request table omits them, unlike its response table).
 */
describe('InqBillRequestDto validation (forbidNonWhitelisted)', () => {
  it('accepts a real VietinBank inq-bill request without stripping/rejecting extra fields', async () => {
    const realPayload = {
      header: {
        msgId: '647ff752-5177-4521-8a22-a97115416a37',
        msgType: '1100',
        channelId: '211701',
        gatewayId: 'G745_ICHI_SKILL',
        providerId: '10080',
        merchantId: '1ICS',
        productId: '900000',
        timestamp: '20260922105140',
        recordNum: '1',
        version: '1.0',
        language: 'vi',
        signature: 'sig',
      },
      data: {
        transId: 'f0c397bee6f62b8cde52f1c436f87f07',
        channelId: '',
        transTime: '20260922105140',
        custCode: '1ICSPD0260922000015',
      },
    };

    const instance = plainToInstance(InqBillRequestDto, realPayload, {
      excludeExtraneousValues: false,
    });
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toEqual([]);
  });

  it('vẫn từ chối field lạ không nằm trong danh sách đã biết (đảm bảo whitelist còn tác dụng)', async () => {
    const payloadWithUnknownField = {
      header: {
        msgId: 'm1',
        msgType: '1100',
        channelId: '211701',
        providerId: '10080',
        merchantId: '1ICS',
        productId: '900000',
        signature: 'sig',
        thisFieldDoesNotExist: 'boom',
      },
      data: {
        transId: 't1',
        transTime: '20260922105140',
        custCode: '1ICSPD0260922000015',
      },
    };

    const instance = plainToInstance(InqBillRequestDto, payloadWithUnknownField, {
      excludeExtraneousValues: false,
    });
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.length).toBeGreaterThan(0);
  });
});
