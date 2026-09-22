import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ViettinbankController } from './viettinbank.controller';
import { CryptoKeyService } from './crypto-key.service';
import { PaymentOrdersService } from '../payment-orders/payment-orders.service';
import { PaymentTransactionsService } from '../payment-transactions/payment-transactions.service';
import { ConfigService } from '@nestjs/config';

/**
 * Only calling controller.inqBill()/notifyBill() directly (as
 * viettinbank.controller.spec.ts does) never exercises main.ts's global
 * ValidationPipe — that's exactly why real VietinBank requests kept 400ing
 * on undeclared fields (header.username, additionalProperties, ...) while
 * every unit test stayed green. This boots the controller behind the same
 * global pipe config as main.ts and posts through supertest, to catch that
 * class of bug for real.
 */
describe('ViettinbankController behind the real global ValidationPipe', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ViettinbankController],
      providers: [
        {
          provide: CryptoKeyService,
          useValue: { verify: jest.fn().mockReturnValue(true), sign: jest.fn().mockReturnValue('signed') },
        },
        {
          provide: PaymentOrdersService,
          useValue: { findByTransferContent: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: PaymentTransactionsService,
          useValue: { ingest: jest.fn().mockResolvedValue({ matched: false, duplicate: false }) },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('1ICSPD0') },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('không trả 400 khi request thật của VietinBank có field lạ (username, additionalProperties)', async () => {
    const res = await request(app.getHttpServer())
      .post('/vpg/collection/api/v1/inq-bill')
      .send({
        header: {
          msgId: 'a87d599f-3911-4b03-bd60-22a5cae2a45c',
          msgType: '1100',
          channelId: '211601',
          gatewayId: 'A101_IBR',
          providerId: '9480',
          merchantId: '8CAP',
          productId: '900000',
          timestamp: '20261231150326',
          username: 'SOA',
          signature: 'sig',
          additionalProperties: {},
        },
        data: {
          transId: 'a87d599f-3911-4b03-bd60-22a5cae2a45c',
          transTime: '07302025153300',
          custCode: '8CAP250730152800001',
          additionalProperties: {},
        },
        additionalProperties: {},
      });

    expect(res.status).not.toBe(400);
    expect(res.body.data.errors.errorCode).toBe('02');
  });

  it('vẫn trả response đúng dạng { header, data } phẳng, không bọc { success, data }', async () => {
    const res = await request(app.getHttpServer())
      .post('/vpg/collection/api/v1/inq-bill')
      .send({
        header: {
          msgId: 'm1',
          msgType: '1100',
          channelId: '211601',
          providerId: '9480',
          merchantId: '8CAP',
          productId: '900000',
          signature: 'sig',
        },
        data: {
          transId: 't1',
          transTime: '20260101000000',
          custCode: '8CAP0001',
        },
      });

    expect(res.body).toHaveProperty('header');
    expect(res.body).toHaveProperty('data');
    expect(res.body).not.toHaveProperty('success');
  });
});
