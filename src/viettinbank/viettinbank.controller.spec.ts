import { ViettinbankController } from './viettinbank.controller';
import { CryptoKeyService } from './crypto-key.service';
import { InqBillRequestDto } from './dto/inq-bill.dto';
import { NotifyBillRequestDto } from './dto/notify-bill.dto';
import { PaymentOrdersService } from '../payment-orders/payment-orders.service';
import { PaymentTransactionsService } from '../payment-transactions/payment-transactions.service';
import { PaymentOrderStatus } from '../common/enums/status.enum';

/**
 * Test cases derived from VIETINBANK_Y3_Thu hộ định danh v1.4.1 - MAP.pdf
 * §2.2.2 (1100/1110 inqBill) and §2.2.3 (1200/1210 notifytrans), plus the
 * error table in §2.4.
 */
describe('ViettinbankController', () => {
  const baseHeader = {
    msgId: 'a87d599f-3911-4b03-bd60-22a5cae2a45c',
    msgType: '1100',
    channelId: '211601',
    providerId: '9480',
    merchantId: '8CAP',
    productId: '900000',
    signature: 'sig',
  };
  const baseData = {
    transId: 'a87d599f-3911-4b03-bd60-22a5cae2a45c',
    transTime: '07302025153300',
    custCode: '8CAP250730152800001',
  };

  function makeController(overrides?: {
    verify?: jest.Mock;
    findByTransferContent?: jest.Mock;
    ingest?: jest.Mock;
  }) {
    const crypto = {
      verify: overrides?.verify ?? jest.fn().mockReturnValue(true),
      sign: jest.fn().mockReturnValue('signed'),
    } as unknown as CryptoKeyService;
    const paymentOrdersService = {
      findByTransferContent:
        overrides?.findByTransferContent ?? jest.fn().mockResolvedValue(null),
    } as unknown as PaymentOrdersService;
    const paymentTransactionsService = {
      ingest: overrides?.ingest ?? jest.fn(),
    } as unknown as PaymentTransactionsService;
    return new ViettinbankController(
      crypto,
      paymentOrdersService,
      paymentTransactionsService,
    );
  }

  describe('inqBill (1100 -> 1110)', () => {
    it('trả về mã 99 khi thiếu dữ liệu bắt buộc', async () => {
      const controller = makeController();
      const dto = { header: baseHeader, data: undefined } as unknown as InqBillRequestDto;

      const res = await controller.inqBill(dto);

      expect(res.data.errors.errorCode).toBe('99');
      expect(res.header.msgType).toBe('1110');
    });

    it('trả về mã 01 khi chữ ký sai', async () => {
      const verify = jest.fn().mockReturnValue(false);
      const controller = makeController({ verify });
      const dto = { header: baseHeader, data: baseData } as InqBillRequestDto;

      const res = await controller.inqBill(dto);

      expect(verify).toHaveBeenCalledWith(
        baseData.transId + baseData.transTime + baseData.custCode,
        baseHeader.signature,
      );
      expect(res.data.errors.errorCode).toBe('01');
    });

    it('trả về mã 02 khi không tìm thấy hóa đơn/mã KH', async () => {
      const findByTransferContent = jest.fn().mockResolvedValue(null);
      const controller = makeController({ findByTransferContent });
      const dto = { header: baseHeader, data: baseData } as InqBillRequestDto;

      const res = await controller.inqBill(dto);

      expect(findByTransferContent).toHaveBeenCalledWith(baseData.custCode);
      expect(res.data.errors.errorCode).toBe('02');
    });

    it('trả về mã 02 khi hóa đơn đã thanh toán/không ở trạng thái chờ', async () => {
      const findByTransferContent = jest.fn().mockResolvedValue({
        orderCode: 'ORD-1',
        status: PaymentOrderStatus.PAID,
        requestedAmount: { toFixed: () => '648000' },
        expiresAt: null,
      });
      const controller = makeController({ findByTransferContent });
      const dto = { header: baseHeader, data: baseData } as InqBillRequestDto;

      const res = await controller.inqBill(dto);

      expect(res.data.errors.errorCode).toBe('02');
    });

    it('trả về mã 02 khi hóa đơn đã hết hạn', async () => {
      const findByTransferContent = jest.fn().mockResolvedValue({
        orderCode: 'ORD-1',
        status: PaymentOrderStatus.PENDING,
        requestedAmount: { toFixed: () => '648000' },
        expiresAt: new Date(Date.now() - 1000),
      });
      const controller = makeController({ findByTransferContent });
      const dto = { header: baseHeader, data: baseData } as InqBillRequestDto;

      const res = await controller.inqBill(dto);

      expect(res.data.errors.errorCode).toBe('02');
    });

    it('trả về mã 00 kèm tên và số tiền khi hóa đơn hợp lệ (PENDING)', async () => {
      const findByTransferContent = jest.fn().mockResolvedValue({
        orderCode: 'ORD-1',
        status: PaymentOrderStatus.PENDING,
        requestedAmount: { toFixed: () => '648000' },
        expiresAt: null,
      });
      const controller = makeController({ findByTransferContent });
      const dto = { header: baseHeader, data: baseData } as InqBillRequestDto;

      const res = await controller.inqBill(dto);

      expect(res.data.errors.errorCode).toBe('00');
      expect(res.data.details.amount).toBe('648000');
      expect(res.data.details.custName).toBe('Order ORD-1');
      expect(res.data.details.transId).toBe(baseData.transId);
      expect(res.data.details.custCode).toBe(baseData.custCode);
      expect(res.header.signature).toBe('signed');
    });

    it('chấp nhận hóa đơn ở trạng thái PARTIALLY_PAID', async () => {
      const findByTransferContent = jest.fn().mockResolvedValue({
        orderCode: 'ORD-2',
        status: PaymentOrderStatus.PARTIALLY_PAID,
        requestedAmount: { toFixed: () => '100000' },
        expiresAt: null,
      });
      const controller = makeController({ findByTransferContent });
      const dto = { header: baseHeader, data: baseData } as InqBillRequestDto;

      const res = await controller.inqBill(dto);

      expect(res.data.errors.errorCode).toBe('00');
    });

    it('giữ nguyên header.msgId/channelId/providerId/merchantId/productId từ request (bản tin response điền lại)', async () => {
      const controller = makeController();
      const dto = { header: baseHeader, data: undefined } as unknown as InqBillRequestDto;

      const res = await controller.inqBill(dto);

      expect(res.header.msgId).toBe(baseHeader.msgId);
      expect(res.header.channelId).toBe(baseHeader.channelId);
      expect(res.header.providerId).toBe(baseHeader.providerId);
      expect(res.header.merchantId).toBe(baseHeader.merchantId);
      expect(res.header.productId).toBe(baseHeader.productId);
    });
  });

  describe('notifyBill (1200 -> 1210)', () => {
    const notifyDto: NotifyBillRequestDto = {
      msgId: 'ea6e8f1b3d28438c89290c152b66ebeb',
      providerId: '9111',
      transId: '501690869',
      transTime: '20240201140634',
      transType: '3',
      custCode: '2NDVNDV24012358711',
      amount: '875800',
      bankTransId: '164T24200GKAJ7BY',
      remark: 'CT DEN:164T24200GKAJ7BY CK',
      currencyCode: 'VND',
      signature: 'sig',
    };

    it('trả về mã 00 khi ingest khớp giao dịch', async () => {
      const ingest = jest.fn().mockResolvedValue({ matched: true, duplicate: false });
      const controller = makeController({ ingest });

      const res = await controller.notifyBill(notifyDto);

      expect(res.errorCode).toBe('00');
      expect(res.transId).toBe(notifyDto.transId);
      expect(res.providerId).toBe(notifyDto.providerId);
    });

    it('trả về mã 00 khi giao dịch trùng (đã xử lý bởi retry trước đó)', async () => {
      const ingest = jest.fn().mockResolvedValue({ matched: false, duplicate: true });
      const controller = makeController({ ingest });

      const res = await controller.notifyBill(notifyDto);

      expect(res.errorCode).toBe('00');
    });

    it('trả về mã 05 khi không khớp được đơn hàng', async () => {
      const ingest = jest.fn().mockResolvedValue({ matched: false, duplicate: false });
      const controller = makeController({ ingest });

      const res = await controller.notifyBill(notifyDto);

      expect(res.errorCode).toBe('05');
    });

    it('trả về mã 01 khi verify chữ ký/ingest ném lỗi', async () => {
      const ingest = jest.fn().mockRejectedValue(new Error('Chữ ký webhook không hợp lệ'));
      const controller = makeController({ ingest });

      const res = await controller.notifyBill(notifyDto);

      expect(res.errorCode).toBe('01');
    });
  });
});
