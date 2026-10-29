import { PaymentMethod } from '../common/enums/status.enum';
import { PaymentOrdersController } from './payment-orders.controller';

describe('PaymentOrdersController QR payment method', () => {
  const studentId = 'student-id';
  const user = { id: 'staff-id' } as never;

  function build() {
    const service = { create: jest.fn().mockResolvedValue({ id: 'order-id' }) };
    const studentsService = {
      findById: jest.fn().mockResolvedValue({ id: studentId, schoolId: 'school-id' }),
    };
    const accessControlService = {
      assertSchoolAccess: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new PaymentOrdersController(
      service as never,
      studentsService as never,
      accessControlService as never,
    );
    return { controller, service, accessControlService };
  }

  it.each([PaymentMethod.VIETQR, PaymentMethod.BANK_TRANSFER, undefined])(
    'converts staff %s orders to VietinBank virtual-account QR',
    async (requested) => {
      const { controller, service, accessControlService } = build();
      await controller.create(
        { studentId, items: [], paymentMethod: requested },
        user,
      );
      expect(accessControlService.assertSchoolAccess).toHaveBeenCalledWith(
        user,
        'school-id',
      );
      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethod: PaymentMethod.VIETINBANK }),
        'staff-id',
      );
    },
  );

  it('keeps cash payments unchanged', async () => {
    const { controller, service } = build();
    await controller.create(
      { studentId, items: [], paymentMethod: PaymentMethod.CASH },
      user,
    );
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: PaymentMethod.CASH }),
      'staff-id',
    );
  });
});
