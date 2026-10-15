import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as crypto from 'crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CryptoKeyService } from './crypto-key.service';
import { ViettinbankApiService } from './viettinbank-api.service';

describe('ViettinbankApiService.generateQr: request gửi VietinBank', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vtb-api-'));
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  writeFileSync(join(dir, 'private.pem'), privateKey);

  const service = (clientIp: string) =>
    new ViettinbankApiService(
      new ConfigService({
        viettinbank: {
          baseUrl: 'https://api.vietinbank.example/qr',
          clientId: 'id',
          clientSecret: 'secret',
          providerId: '10080',
          merchantId: '10080',
          privateKeyPath: join(dir, 'private.pem'),
          clientIp,
        },
      }),
      {} as CryptoKeyService,
    );
  const input = {
    accountNumber: '2ICS69D261015000014',
    amount: 2000,
    purposeOfTrans: '261015000014',
  };
  let post: jest.SpyInstance;

  beforeEach(() => {
    post = jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        requestId: 'r',
        providerId: '10080',
        merchantId: '10080',
        clientDt: 'd',
        status: { statusCode: '00' },
        signature: 's',
      },
    });
  });
  afterEach(() => post.mockRestore());
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const sentBody = () =>
    (post.mock.calls[0] as [string, Record<string, unknown>])[1];

  it('gửi clientIP như bản tích hợp tham chiếu (kidoedu) khi VIETINBANK_CLIENT_IP được đặt', async () => {
    await service('160.250.132.143').generateQr(input);
    expect(sentBody()).toMatchObject({
      providerId: '10080',
      merchantId: '10080',
      channel: 'WEB',
      version: '1.0.1',
      language: 'vi',
      clientIP: '160.250.132.143',
      data: input,
    });
    expect(Object.keys(sentBody())).toEqual([
      'requestId',
      'providerId',
      'merchantId',
      'channel',
      'version',
      'language',
      'clientIP',
      'clientDt',
      'data',
      'signature',
    ]);
  });

  it('không đặt VIETINBANK_CLIENT_IP thì không gửi clientIP', async () => {
    await service('').generateQr(input);
    expect(sentBody()).not.toHaveProperty('clientIP');
  });

  it('chữ ký request vẫn theo công thức requestId+providerId+merchantId+clientDt+accountNumber', async () => {
    await service('160.250.132.143').generateQr(input);
    const body = sentBody() as Record<string, string>;
    const verified = crypto
      .createVerify('RSA-SHA256')
      .update(
        body.requestId +
          body.providerId +
          body.merchantId +
          body.clientDt +
          input.accountNumber,
      )
      .verify(crypto.createPublicKey(privateKey), body.signature, 'base64');
    expect(verified).toBe(true);
  });
});
