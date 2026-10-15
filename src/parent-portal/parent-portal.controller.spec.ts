import { ConfigService } from '@nestjs/config';
import { PaymentMethod } from '../common/enums/status.enum';
import { ParentPortalController } from './parent-portal.controller';

describe('ParentPortalController tạo đơn: phương thức QR', () => {
  const parent = { studentId: 'student-id' } as never;
  const items = [{ receivableId: 'receivable-id' }];

  function build(defaultProvider?: string) {
    const paymentOrdersService = {
      create: jest.fn().mockResolvedValue({
        id: 'order-id',
        status: 'PENDING',
        invoiceEmail: null,
      }),
    };
    const einvoiceService = {
      summaryForPaymentOrder: jest.fn().mockResolvedValue(null),
    };
    const controller = new ParentPortalController(
      {} as never,
      {} as never,
      paymentOrdersService as never,
      einvoiceService as never,
      new ConfigService({ payment: { defaultProvider } }),
    );
    const methodSent = () =>
      (
        paymentOrdersService.create.mock.calls[0] as [
          { paymentMethod?: PaymentMethod },
        ]
      )[0].paymentMethod;
    return { controller, methodSent };
  }

  it.each([PaymentMethod.VIETQR, undefined])(
    'PAYMENT_PROVIDER=VIETINBANK: phụ huynh gửi %s → đơn dùng QR VietinBank để được báo tự động',
    async (requested) => {
      const { controller, methodSent } = build('VIETINBANK');
      await controller.createPaymentOrder(
        { items, paymentMethod: requested },
        parent,
      );
      expect(methodSent()).toBe(PaymentMethod.VIETINBANK);
    },
  );

  it('PAYMENT_PROVIDER=VIETQR: giữ nguyên phương thức phụ huynh gửi', async () => {
    const { controller, methodSent } = build('VIETQR');
    await controller.createPaymentOrder(
      { items, paymentMethod: PaymentMethod.VIETQR },
      parent,
    );
    expect(methodSent()).toBe(PaymentMethod.VIETQR);
  });

  it('phương thức không phải QR (tiền mặt) không bị đổi', async () => {
    const { controller, methodSent } = build('VIETINBANK');
    await controller.createPaymentOrder(
      { items, paymentMethod: PaymentMethod.CASH },
      parent,
    );
    expect(methodSent()).toBe(PaymentMethod.CASH);
  });

  it('studentId luôn lấy từ token phụ huynh', async () => {
    const paymentOrdersService = {
      create: jest.fn().mockResolvedValue({ id: 'o', status: 'PENDING' }),
    };
    const controller = new ParentPortalController(
      {} as never,
      {} as never,
      paymentOrdersService as never,
      { summaryForPaymentOrder: jest.fn().mockResolvedValue(null) } as never,
      new ConfigService({}),
    );
    await controller.createPaymentOrder({ items }, parent);
    expect(paymentOrdersService.create).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: 'student-id' }),
      undefined,
      { invoiceEmail: null },
    );
  });
});
