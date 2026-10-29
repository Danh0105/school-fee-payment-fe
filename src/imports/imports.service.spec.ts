import { ImportsService } from './imports.service';
import {
  ImportSessionStatus,
  ImportSessionType,
} from './entities/import-session.entity';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { Role } from '../common/enums/role.enum';

describe('ImportsService file validation', () => {
  const service = new ImportsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const dto = {
    schoolId: '00000000-0000-4000-8000-000000000001',
    academicYearId: '00000000-0000-4000-8000-000000000002',
    type: ImportSessionType.STUDENTS,
  };
  const actor = {
    id: '00000000-0000-4000-8000-000000000003',
    email: 'admin@example.com',
    role: Role.ADMIN,
    schoolId: null,
    companyId: null,
  };

  it('returns a validation error when the file is missing', async () => {
    await expect(service.preview(undefined, dto, actor)).rejects.toMatchObject({
      errorCode: ErrorCode.VALIDATION_ERROR,
      message: 'Vui lòng chọn file Excel để import',
    } satisfies Partial<AppException>);
  });

  it('explains how to convert a legacy .xls file', async () => {
    const file = {
      originalname: 'danh-sach-hoc-sinh.xls',
      buffer: Buffer.from('legacy excel'),
    } as Express.Multer.File;

    try {
      await service.preview(file, dto, actor);
      throw new Error('Expected preview to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).errorCode).toBe(
        ErrorCode.VALIDATION_ERROR,
      );
      expect((error as AppException).message).toContain(
        'Excel Workbook (*.xlsx)',
      );
    }
  });
});

describe('ImportsService confirm of a payment list', () => {
  const sessionId = '00000000-0000-4000-8000-000000000010';
  const actor = { userId: '00000000-0000-4000-8000-000000000003' };
  const listSession = (status: ImportSessionStatus, rows = 12) => ({
    id: sessionId,
    status,
    schoolId: 'school-1',
    feePlanId: null,
    validRowCount: rows,
    validRows: Array.from({ length: rows }, (_, index) => ({
      rowNumber: index + 2,
      originalAmount: '560000.00',
      className: '1A1',
      fullName: `Học sinh ${index + 1}`,
    })),
    bootstrapContext: null,
    paymentOptions: { createPaymentOrders: true },
  });

  function build(session: ReturnType<typeof listSession>) {
    const sessionRepo = {
      findOne: jest.fn().mockResolvedValue(session),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const dataSource = { transaction: jest.fn() };
    let inFlight = 0;
    let maxInFlight = 0;
    const paymentOrders = {
      beneficiaryName: jest.fn().mockReturnValue('CONG TY'),
      prepareOrderQr: jest.fn(async () => {
        if (paymentOrders.prepareOrderQr.mock.calls.length === 8) {
          throw new Error('VietinBank down');
        }
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return { orderCode: 'PAY1' };
      }),
    };
    const service = new ImportsService(
      sessionRepo as never,
      {} as never,
      { findOne: jest.fn().mockResolvedValue({ name: 'Trường A' }) } as never,
      {} as never,
      dataSource as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      paymentOrders as never,
      {} as never,
    );
    return {
      service,
      sessionRepo,
      dataSource,
      paymentOrders,
      maxInFlight: () => maxInFlight,
    };
  }

  it('refuses a list that is still being saved', async () => {
    const { service, sessionRepo, paymentOrders } = build(
      listSession(ImportSessionStatus.PROCESSING),
    );

    await expect(service.confirm(sessionId, actor)).rejects.toMatchObject({
      message: 'Danh sách này đang được lưu, vui lòng chờ trong giây lát',
    });
    expect(sessionRepo.update).not.toHaveBeenCalled();
    expect(paymentOrders.prepareOrderQr).not.toHaveBeenCalled();
  });

  it('does not save when another confirm claimed the list first', async () => {
    const { service, sessionRepo, paymentOrders } = build(
      listSession(ImportSessionStatus.PENDING_CONFIRMATION),
    );
    sessionRepo.update.mockResolvedValueOnce({ affected: 0 });

    await expect(service.confirm(sessionId, actor)).rejects.toMatchObject({
      message: 'Danh sách này đang được lưu hoặc đã được xử lý',
    });
    expect(paymentOrders.prepareOrderQr).not.toHaveBeenCalled();
  });

  it('draws QRs a few at a time and frees the list when the bank fails', async () => {
    const { service, sessionRepo, dataSource, paymentOrders, maxInFlight } =
      build(listSession(ImportSessionStatus.PENDING_CONFIRMATION));

    await expect(service.confirm(sessionId, actor)).rejects.toThrow(
      'VietinBank down',
    );

    expect(sessionRepo.update).toHaveBeenNthCalledWith(
      1,
      { id: sessionId, status: ImportSessionStatus.PENDING_CONFIRMATION },
      { status: ImportSessionStatus.PROCESSING },
    );
    expect(sessionRepo.update).toHaveBeenLastCalledWith(
      { id: sessionId, status: ImportSessionStatus.PROCESSING },
      { status: ImportSessionStatus.PENDING_CONFIRMATION },
    );
    expect(maxInFlight()).toBeGreaterThan(1);
    expect(maxInFlight()).toBeLessThanOrEqual(5);
    // Rows not yet started when the bank failed are not sent.
    expect(paymentOrders.prepareOrderQr.mock.calls.length).toBeLessThan(12);
    expect(paymentOrders.prepareOrderQr).toHaveBeenCalledWith(
      expect.anything(),
      'CONG TY',
      'Trường A - Lớp 1A1 - Học sinh 1',
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
