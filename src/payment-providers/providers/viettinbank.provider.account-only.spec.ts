import { ConfigService } from '@nestjs/config';
import Decimal from 'decimal.js';
import { CryptoKeyService } from '../../viettinbank/crypto-key.service';
import { ViettinbankApiService } from '../../viettinbank/viettinbank-api.service';
import { ViettinbankProvider } from './viettinbank.provider';

describe('ViettinbankProvider: VIETINBANK_ACCOUNT_ONLY', () => {
  function makeProvider(accountOnly: boolean) {
    const generateQr = jest.fn().mockResolvedValue({ data: {} });
    const provider = new ViettinbankProvider(
      new ConfigService({
        viettinbank: { account: '2ICS69D', accountOnly },
      }),
      {} as CryptoKeyService,
      { generateQr } as unknown as ViettinbankApiService,
    );
    return { provider, generateQr };
  }
  const qrInput = {
    bankCode: '970415',
    bankAccountNumber: '118636563979',
    bankAccountName: 'Trường Tiểu học Ánh Dương',
    amount: new Decimal(2000),
    transferContent: '261015000018',
  };
  const notify = (custCode: string, remark: string) => ({
    transId: 't1',
    transTime: '20261015160000',
    custCode,
    amount: '2000',
    remark,
  });

  it('bật: số tài khoản trong QR chỉ còn VAC, mã đơn nằm trong nội dung chuyển khoản', async () => {
    const { provider, generateQr } = makeProvider(true);
    await provider.generateQr(qrInput);
    expect(generateQr).toHaveBeenCalledWith({
      accountNumber: '2ICS69D',
      amount: 2000,
      purposeOfTrans: '261015000018',
    });
  });

  it('tắt (mặc định): số tài khoản là VAC + mã đơn như trước', async () => {
    const { provider, generateQr } = makeProvider(false);
    await provider.generateQr(qrInput);
    expect(generateQr).toHaveBeenCalledWith(
      expect.objectContaining({ accountNumber: '2ICS69D261015000018' }),
    );
  });

  it('notify với tài khoản chỉ có VAC: lấy mã đơn từ nội dung chuyển khoản', () => {
    const { provider } = makeProvider(true);
    expect(
      provider.parseTransaction(notify('2ICS69D', 'MOMO 261015000018 hoc phi'))
        .transferContent,
    ).toBe('261015000018');
  });

  it('notify có VAC + mã đơn: vẫn lấy từ số tài khoản', () => {
    const { provider } = makeProvider(false);
    expect(
      provider.parseTransaction(notify('2ICS69D261015000018', 'khac'))
        .transferContent,
    ).toBe('261015000018');
  });

  it('không lấy nhầm dãy số dài hơn 12 chữ số (ví dụ mã giao dịch ngân hàng)', () => {
    const { provider } = makeProvider(true);
    expect(
      provider.parseTransaction(notify('2ICS69D', 'CK 1517810031951234'))
        .transferContent,
    ).toBeNull();
  });
});
