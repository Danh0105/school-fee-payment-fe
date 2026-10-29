import { PaymentMethod } from '../common/enums/status.enum';
import { ParentPortalController } from './parent-portal.controller';

describe('ParentPortalController tạo đơn: phương thức QR', () => {
  const parent = { studentId: 'student-id' } as never;
  const items = [{ receivableId: 'receivable-id' }];

  function build() {
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
    );
    const methodSent = () =>
      (
        paymentOrdersService.create.mock.calls[0] as [
          { paymentMethod?: PaymentMethod },
        ]
      )[0].paymentMethod;
    return { controller, methodSent };
  }

  it.each([PaymentMethod.VIETQR, PaymentMethod.BANK_TRANSFER, undefined])(
    'phụ huynh gửi %s → luôn tạo QR tài khoản ảo VietinBank',
    async (requested) => {
      const { controller, methodSent } = build();
      await controller.createPaymentOrder(
        { items, paymentMethod: requested },
        parent,
      );
      expect(methodSent()).toBe(PaymentMethod.VIETINBANK);
    },
  );

  it('giữ nguyên yêu cầu VIETINBANK của phụ huynh', async () => {
    const { controller, methodSent } = build();
    await controller.createPaymentOrder(
      { items, paymentMethod: PaymentMethod.VIETINBANK },
      parent,
    );
    expect(methodSent()).toBe(PaymentMethod.VIETINBANK);
  });

  it('phương thức không phải QR (tiền mặt) không bị đổi', async () => {
    const { controller, methodSent } = build();
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
    );
    await controller.createPaymentOrder({ items }, parent);
    expect(paymentOrdersService.create).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: 'student-id' }),
      undefined,
      { invoiceEmail: null },
    );
  });
});
