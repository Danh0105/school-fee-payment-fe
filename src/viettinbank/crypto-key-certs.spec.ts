import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CryptoKeyService } from './crypto-key.service';

/**
 * VietinBank signs inq-bill ("API vấn tin") with the key of its API
 * certificate and notify-bill with its NOTIFYTRANS certificate. Real RSA keys
 * stand in for both so the certificate choice itself is exercised.
 */
describe('CryptoKeyService: chứng chỉ nào kiểm chữ ký nào', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vtb-certs-'));
  const pair = () =>
    crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
  const ours = pair();
  const bankApi = pair();
  const bankNotify = pair();
  const stranger = pair();

  writeFileSync(join(dir, 'private.pem'), ours.privateKey);
  writeFileSync(join(dir, 'api.pem'), bankApi.publicKey);
  writeFileSync(join(dir, 'notify.pem'), bankNotify.publicKey);

  const service = new CryptoKeyService(
    new ConfigService({
      viettinbank: {
        privateKeyPath: join(dir, 'private.pem'),
        publicKeyPath: join(dir, 'api.pem'),
        notifyCertPath: join(dir, 'notify.pem'),
      },
    }),
  );
  const data = 'a87d599f07302025153300' + '2ICS69D261015000014';
  const signWith = (privateKey: string) =>
    crypto
      .createSign('RSA-SHA256')
      .update(data, 'utf8')
      .sign(privateKey, 'base64');

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('inq-bill ký bằng khóa chứng chỉ API → hợp lệ (trước đây bị trả 01 Sai chữ ký)', () => {
    const signature = signWith(bankApi.privateKey);
    expect(service.verifyInquiry(data, signature)).toBe('API');
    // The old check only knew the notify certificate.
    expect(service.verify(data, signature)).toBe(false);
  });

  it('inq-bill ký bằng chứng chỉ NOTIFYTRANS vẫn được chấp nhận (dự phòng)', () => {
    expect(service.verifyInquiry(data, signWith(bankNotify.privateKey))).toBe(
      'NOTIFY',
    );
  });

  it('notify-bill ký bằng chứng chỉ NOTIFYTRANS → hợp lệ', () => {
    expect(service.verifyNotify(data, signWith(bankNotify.privateKey))).toBe(
      'NOTIFY',
    );
  });

  it('chữ ký không phải của VietinBank → bị từ chối ở cả hai', () => {
    const signature = signWith(stranger.privateKey);
    expect(service.verifyInquiry(data, signature)).toBeNull();
    expect(service.verifyNotify(data, signature)).toBeNull();
  });

  it('dữ liệu bị sửa sau khi ký → bị từ chối', () => {
    const signature = signWith(bankApi.privateKey);
    expect(service.verifyInquiry(data + 'X', signature)).toBeNull();
  });
});
