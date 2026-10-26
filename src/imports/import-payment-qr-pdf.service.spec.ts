import Decimal from 'decimal.js';
import { ImportPaymentQrPdfService } from './import-payment-qr-pdf.service';
import {
  ImportSession,
  ImportSessionStatus,
  ImportSessionType,
  ParsedImportRow,
} from './entities/import-session.entity';
import { StudentStatus } from '../common/enums/status.enum';

describe('ImportPaymentQrPdfService', () => {
  const schoolRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: 'school-1',
      code: 'THVTS',
      name: 'Trường Tiểu học Võ Thị Sáu',
      bankName: 'TECHCOMBANK',
      bankCode: '970407',
      bankAccountNumber: '917545191',
      bankAccountName: 'ANH VIET FLIT, JSC',
    }),
  };
  const academicYearRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: 'year-1',
      name: '2026-2027',
    }),
  };
  const paymentOrderRepository = {
    find: jest.fn().mockResolvedValue([
      {
        id: 'order-1',
        bankAccountNumber: '2ICS69D261023000001',
        requestedAmount: new Decimal(560000),
        transferContent: '261023000001',
        legacyTransferContent:
          'HV072318004706 THVTS Lop 3A4 Phan Duong Linh Dan',
        qrPayload: '00020101021238590010A000000727',
        expiresAt: null,
      },
    ]),
  };
  const config = {
    get: jest.fn().mockReturnValue('CTCP GIAO DUC KHCN ICHI SKILL'),
  };
  const service = new ImportPaymentQrPdfService(
    schoolRepository as never,
    academicYearRepository as never,
    paymentOrderRepository as never,
    config as never,
  );

  const row = (
    rowNumber: number,
    fullName: string,
    dateOfBirth: string,
    identifierCode: string,
  ): ParsedImportRow => ({
    rowNumber,
    studentCode: null,
    identifierCode,
    fullName,
    dateOfBirth,
    gender: null,
    address: null,
    phone: null,
    parentName: null,
    parentPhone: null,
    parentEmail: null,
    status: StudentStatus.ACTIVE,
    classCode: '3A4',
    className: '3A4',
    classGrade: '3',
    quantity: '0.00',
    unitPrice: '0.00',
    originalAmount: '560000.00',
    legacyTransferContent: `HV${identifierCode} THVTS Lớp 3A4 ${fullName}`,
    serviceName: null,
    unitName: null,
    buyerName: null,
    buyerAddress: null,
    buyerIdNo: null,
  });

  it('creates one Unicode payment slip page per imported student', async () => {
    const session = {
      id: 'session-1',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      feePlanId: null,
      type: ImportSessionType.STUDENTS,
      fileName: 'BỔ SUNG VTS 20.10.xlsx',
      totalRows: 2,
      validRowCount: 2,
      invalidRowCount: 0,
      validRows: [
        row(2, 'Phan Dương Linh Đan', '2018-09-21', '072318004706'),
        row(3, 'Lê Chấn Hưng', '2019-10-08', '072218005492'),
      ],
      errors: [],
      bootstrapContext: null,
      status: ImportSessionStatus.PENDING_CONFIRMATION,
      createdBy: 'user-1',
      confirmResult: null,
      paymentOptions: null,
    } as unknown as ImportSession;

    const pdf = await service.create(session);

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)).toHaveLength(2);
  });

  const paymentListSession = (
    confirmResult: ImportSession['confirmResult'],
  ): ImportSession =>
    ({
      id: 'session-2',
      schoolId: 'school-1',
      academicYearId: 'year-1',
      validRows: [row(2, 'Phan Dương Linh Đan', '2018-09-21', '072318004706')],
      bootstrapContext: null,
      confirmResult,
      paymentOptions: {
        createPaymentOrders: true,
        qrExpiresAt: null,
        title: null,
      },
    }) as unknown as ImportSession;

  it('prints a saved payment list from its VietinBank orders', async () => {
    const pdf = await service.create(
      paymentListSession({
        paymentOrders: [
          { rowNumber: 2, paymentOrderId: 'order-1', orderCode: 'PAY1' },
        ],
      }),
    );

    expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)).toHaveLength(1);
    expect(paymentOrderRepository.find).toHaveBeenCalled();
  });

  it('refuses a payment list that is not saved yet', async () => {
    await expect(service.create(paymentListSession(null))).rejects.toThrow(
      'Hãy lưu danh sách trước',
    );
  });
});
