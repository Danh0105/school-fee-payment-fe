import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { CryptoKeyService } from './crypto-key.service';

/**
 * Test cases derived from the "4.1 Thuật toán ký số" section shared by both
 * PDFs: RSA sign/verify (SHA256) roundtrip, and rejection of a tampered
 * message or wrong-key signature.
 */
describe('CryptoKeyService', () => {
  let tmpDir: string;
  let ourKeyPair: crypto.KeyPairSyncResult<string, string>;
  let bankKeyPair: crypto.KeyPairSyncResult<string, string>;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vtb-keys-'));
    ourKeyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    bankKeyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    fs.writeFileSync(path.join(tmpDir, 'our-private.pem'), ourKeyPair.privateKey);
    fs.writeFileSync(path.join(tmpDir, 'our-public.pem'), ourKeyPair.publicKey);
    fs.writeFileSync(path.join(tmpDir, 'bank-cert.pem'), bankKeyPair.publicKey);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeService(): CryptoKeyService {
    const config = {
      get: (key: string) => {
        switch (key) {
          case 'viettinbank.privateKeyPath':
            return path.join(tmpDir, 'our-private.pem');
          case 'viettinbank.publicKeyPath':
            return path.join(tmpDir, 'our-public.pem');
          case 'viettinbank.notifyCertPath':
            return path.join(tmpDir, 'bank-cert.pem');
          default:
            return undefined;
        }
      },
    } as unknown as ConfigService;
    return new CryptoKeyService(config);
  }

  it('ký dữ liệu bằng private key của mình và verify được bằng chính public key tương ứng', () => {
    const service = makeService();
    const signData = '501690869202402011406342NDVNDV24012358711875800164T24200GKAJ7BY CT DEN:164T24200GKAJ7BY CK';

    const signature = service.sign(signData);

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(signData, 'utf8');
    verifier.end();
    expect(verifier.verify(ourKeyPair.publicKey, signature, 'base64')).toBe(true);
  });

  it('verify() trả về true khi chữ ký hợp lệ từ bank (RSA_PKCS1_PADDING)', () => {
    const service = makeService();
    const signData = 'requestIdproviderIdmerchantIdclientDtaccountNumber';
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(Buffer.from(signData, 'utf8'));
    signer.end();
    const signature = signer.sign(
      { key: bankKeyPair.privateKey, padding: crypto.constants.RSA_PKCS1_PADDING },
      'base64',
    );

    expect(service.verify(signData, signature)).toBe(true);
  });

  it('verify() trả về false khi dữ liệu bị thay đổi (mất toàn vẹn)', () => {
    const service = makeService();
    const signData = 'original-data';
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(Buffer.from(signData, 'utf8'));
    signer.end();
    const signature = signer.sign(
      { key: bankKeyPair.privateKey, padding: crypto.constants.RSA_PKCS1_PADDING },
      'base64',
    );

    expect(service.verify('tampered-data', signature)).toBe(false);
  });

  it('verify() trả về false khi chữ ký được ký bởi key khác (không phải bank cert)', () => {
    const service = makeService();
    const signData = 'some-data';
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(Buffer.from(signData, 'utf8'));
    signer.end();
    // Signed with our own key, not the bank's — verify() checks against notifyCert.
    const wrongSignature = signer.sign(ourKeyPair.privateKey, 'base64');

    expect(service.verify(signData, wrongSignature)).toBe(false);
  });

  it('verify() trả về false thay vì throw khi signature không phải base64 hợp lệ', () => {
    const service = makeService();

    expect(service.verify('data', 'not-a-valid-signature!!')).toBe(false);
  });

  it('verify() bỏ qua ký tự xuống dòng thừa trong signature trước khi decode base64', () => {
    const service = makeService();
    const signData = 'clean-data';
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(Buffer.from(signData, 'utf8'));
    signer.end();
    const signature = signer.sign(
      { key: bankKeyPair.privateKey, padding: crypto.constants.RSA_PKCS1_PADDING },
      'base64',
    );
    const withNewlines = signature.replace(/(.{20})/g, '$1\n');

    expect(service.verify(signData, withNewlines)).toBe(true);
  });

  it('onModuleInit không throw khi VietinBank chưa được cấu hình (privateKeyPath rỗng)', () => {
    const config = { get: () => undefined } as unknown as ConfigService;
    const service = new CryptoKeyService(config);

    expect(() => service.onModuleInit()).not.toThrow();
  });

  it('onModuleInit throw ngay khi đã cấu hình privateKeyPath nhưng thiếu file khác', () => {
    const config = {
      get: (key: string) =>
        key === 'viettinbank.privateKeyPath'
          ? path.join(tmpDir, 'our-private.pem')
          : undefined,
    } as unknown as ConfigService;
    const service = new CryptoKeyService(config);

    expect(() => service.onModuleInit()).toThrow();
  });
});
