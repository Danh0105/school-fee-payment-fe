import Decimal from 'decimal.js';
import { ConfigService } from '@nestjs/config';
import { ViettinbankProvider } from './viettinbank.provider';
import { CryptoKeyService } from '../../viettinbank/crypto-key.service';
import { ViettinbankApiService } from '../../viettinbank/viettinbank-api.service';

/**
 * Test cases derived from VIETINBANK_Y3_Thu hộ định danh v1.4.1 - MAP.pdf
 * §2.2.3 (notify-trans signature = transId + transTime + custCode + amount +
 * bankTransId + remark) and its sample message.
 */
describe('ViettinbankProvider', () => {
  const notifyPayload = {
    msgId: 'ea6e8f1b3d28438c89290c152b66ebeb',
    providerId: '9111',
    transId: '501690869',
    transTime: '20240201140634',
    transType: '3',
    custCode: '2NDVNDV24012358711',
    sendAcctId: '66666666',
    recvAcctId: '116002680669',
    recvVirtualAcctId: '2NDVNDV24012358711',
    bankTransId: '164T24200GKAJ7BY',
    amount: '875800',
    remark: 'CT DEN:164T24200GKAJ7BY CK',
    currencyCode: 'VND',
    signature: 'sig',
  };

  function makeProvider(
    verify: jest.Mock,
    vac?: string,
    generateQr?: jest.Mock,
  ) {
    const config = {
      get: (key: string) => (key === 'viettinbank.account' ? vac : undefined),
    } as unknown as ConfigService;
    const cryptoKeys = { verify } as unknown as CryptoKeyService;
    const api = { generateQr } as unknown as ViettinbankApiService;
    return new ViettinbankProvider(config, cryptoKeys, api);
  }

  describe('verifyWebhook', () => {
    it('gọi verify với đúng thứ tự ghép chuỗi: transId+transTime+custCode+amount+bankTransId+remark', () => {
      const verify = jest.fn().mockReturnValue(true);
      const provider = makeProvider(verify);

      const result = provider.verifyWebhook(notifyPayload, {});

      expect(verify).toHaveBeenCalledWith(
        '501690869202402011406342NDVNDV24012358711875800164T24200GKAJ7BYCT DEN:164T24200GKAJ7BY CK',
        'sig',
      );
      expect(result).toBe(true);
    });

    it('trả về false khi thiếu trường signature', () => {
      const verify = jest.fn();
      const provider = makeProvider(verify);
      const { signature, ...withoutSignature } = notifyPayload;
      void signature;

      const result = provider.verifyWebhook(withoutSignature, {});

      expect(result).toBe(false);
      expect(verify).not.toHaveBeenCalled();
    });

    it('trả về false khi CryptoKeyService.verify trả về false (chữ ký sai)', () => {
      const verify = jest.fn().mockReturnValue(false);
      const provider = makeProvider(verify);

      expect(provider.verifyWebhook(notifyPayload, {})).toBe(false);
    });

    it('bỏ qua trường không có giá trị khi ghép chuỗi ký (vd bankTransId rỗng)', () => {
      const verify = jest.fn().mockReturnValue(true);
      const provider = makeProvider(verify);
      const payloadNoBankTransId = { ...notifyPayload, bankTransId: undefined };

      provider.verifyWebhook(payloadNoBankTransId, {});

      expect(verify).toHaveBeenCalledWith(
        '501690869202402011406342NDVNDV24012358711875800CT DEN:164T24200GKAJ7BY CK',
        'sig',
      );
    });
  });

  describe('parseTransaction', () => {
    it('map đầy đủ thông tin từ notify-bill request mẫu trong tài liệu', () => {
      const provider = makeProvider(jest.fn());

      const parsed = provider.parseTransaction(notifyPayload);

      expect(parsed.externalTransactionId).toBe('501690869');
      expect(parsed.bankTransactionId).toBe('164T24200GKAJ7BY');
      expect(parsed.bankCode).toBe('ICB');
      expect(parsed.bankAccountNumber).toBe('116002680669');
      expect(parsed.amount.equals(new Decimal('875800'))).toBe(true);
      expect(parsed.transferContent).toBe('2NDVNDV24012358711');
      expect(parsed.direction).toBe('in');
      expect(parsed.transactionTime.getFullYear()).toBe(2024);
      expect(parsed.transactionTime.getMonth()).toBe(1); // 0-indexed => Feb
      expect(parsed.transactionTime.getDate()).toBe(1);
      expect(parsed.transactionTime.getHours()).toBe(14);
      expect(parsed.transactionTime.getMinutes()).toBe(6);
      expect(parsed.transactionTime.getSeconds()).toBe(34);
    });

    it('tách mã VAC (1ICS) khỏi custCode khi map transferContent (custCode = VAC + VAV)', () => {
      const provider = makeProvider(jest.fn(), '1ICS');

      const parsed = provider.parseTransaction({
        ...notifyPayload,
        custCode: '1ICS2NDVNDV24012358711',
      });

      expect(parsed.transferContent).toBe('2NDVNDV24012358711');
    });

    it('giữ nguyên custCode nếu không khớp tiền tố VAC đã cấu hình', () => {
      const provider = makeProvider(jest.fn(), '1ICS');

      const parsed = provider.parseTransaction({
        ...notifyPayload,
        custCode: 'OTHER2NDVNDV24012358711',
      });

      expect(parsed.transferContent).toBe('OTHER2NDVNDV24012358711');
    });

    it('throw khi thiếu transId', () => {
      const provider = makeProvider(jest.fn());
      const { transId, ...rest } = notifyPayload;
      void transId;

      expect(() => provider.parseTransaction(rest)).toThrow(/transId/);
    });

    it('throw khi thiếu amount', () => {
      const provider = makeProvider(jest.fn());
      const { amount, ...rest } = notifyPayload;
      void amount;

      expect(() => provider.parseTransaction(rest)).toThrow(/amount/);
    });

    it('cho phép amount = 0 (không throw vì amount hợp lệ, chỉ null/undefined mới bị chặn)', () => {
      const provider = makeProvider(jest.fn());

      const parsed = provider.parseTransaction({ ...notifyPayload, amount: '0' });

      expect(parsed.amount.equals(new Decimal(0))).toBe(true);
    });

    it('bankTransactionId là null khi không có mã tham chiếu (giao dịch tại quầy)', () => {
      const provider = makeProvider(jest.fn());
      const { bankTransId, ...rest } = notifyPayload;
      void bankTransId;

      const parsed = provider.parseTransaction(rest);

      expect(parsed.bankTransactionId).toBeNull();
    });

    it('dùng thời gian hiện tại khi thiếu transTime thay vì throw', () => {
      const provider = makeProvider(jest.fn());
      const { transTime, ...rest } = notifyPayload;
      void transTime;

      const before = Date.now();
      const parsed = provider.parseTransaction(rest);
      const after = Date.now();

      expect(parsed.transactionTime.getTime()).toBeGreaterThanOrEqual(before);
      expect(parsed.transactionTime.getTime()).toBeLessThanOrEqual(after);
    });
  });

  describe('generateQr', () => {
    // Bản tin mẫu response từ tài liệu Generate VietQR §2.1 — base64QRCode
    // decode ra EMV string kết thúc bằng "...thanh toan hoa don63047660".
    const sampleBase64QrCode =
      'MDAwMjAxMDEwMjEyMzg0ODAwMTBBMDAwMDAwNzI3MDExODAwMDY5NzA0MTUwMTA0dHVkdDAyMDhRUklCRlRUQTUzMDM3MDQ1NDA2NTAwMDAwNTgwMlZONjI3OTAzMDltYWN1YWhhbmcwNTEyZmI1M2NmOTItYmJjMDYxMW1ha2hhY2hoYW5nMDcwOW1hZGllbWJhbjA4MTh0aGFuaCB0b2FuIGhvYSBkb242MzA0NzY2MA==';

    it('decode base64QRCode của bank thành qrPayload dạng chuỗi EMV, không phải trả nguyên base64', async () => {
      const generateQr = jest.fn().mockResolvedValue({
        data: { base64QRCode: sampleBase64QrCode },
      });
      const provider = makeProvider(jest.fn(), '1ICSPD0', generateQr);

      const result = await provider.generateQr({
        bankCode: 'ICB',
        bankAccountNumber: '',
        bankAccountName: 'Truong Tieu Hoc ABC',
        amount: new Decimal('100000'),
        transferContent: 'PAY260001',
      });

      expect(result.qrPayload).toBe(
        Buffer.from(sampleBase64QrCode, 'base64').toString('utf8'),
      );
      expect(result.qrPayload).toContain('QRIBFTTA');
      expect(result.qrPayload?.startsWith('MDAwMjAx')).toBe(false);
    });

    it('build qrUrl render được ảnh (img.vietqr.io) từ accountNumber = VAC + transferContent', async () => {
      const generateQr = jest.fn().mockResolvedValue({
        data: { base64QRCode: sampleBase64QrCode },
      });
      const provider = makeProvider(jest.fn(), '1ICSPD0', generateQr);

      const result = await provider.generateQr({
        bankCode: 'ICB',
        bankAccountNumber: '',
        bankAccountName: 'Truong Tieu Hoc ABC',
        amount: new Decimal('100000'),
        transferContent: 'PAY260001',
      });

      expect(result.qrUrl).toContain('https://img.vietqr.io/image/970415-');
      expect(result.qrUrl).toContain('1ICSPD0PAY260001');
      expect(generateQr).toHaveBeenCalledWith({
        accountNumber: '1ICSPD0PAY260001',
        amount: 100000,
        purposeOfTrans: 'PAY260001',
      });
    });

    it('trả về qrPayload/qrUrl null khi bank không trả base64QRCode', async () => {
      const generateQr = jest.fn().mockResolvedValue({ data: {} });
      const provider = makeProvider(jest.fn(), '1ICSPD0', generateQr);

      const result = await provider.generateQr({
        bankCode: 'ICB',
        bankAccountNumber: '',
        bankAccountName: 'Truong Tieu Hoc ABC',
        amount: new Decimal('100000'),
        transferContent: 'PAY260001',
      });

      expect(result.qrPayload).toBeNull();
      expect(result.qrUrl).toBeNull();
    });
  });
});
