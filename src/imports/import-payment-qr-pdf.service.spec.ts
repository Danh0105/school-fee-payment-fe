import Decimal from 'decimal.js';
import {
  ImportPaymentQrPdfService,
  paymentSlipContent,
  paymentSlipQrPayload,
} from './import-payment-qr-pdf.service';
import {
  ImportSession,
  ImportSessionStatus,
  ImportSessionType,
  ParsedImportRow,
} from './entities/import-session.entity';
import { StudentStatus } from '../common/enums/status.enum';

function tlvFields(value: string): Map<string, string> {
  const bytes = Buffer.from(value, 'utf8');
  const fields = new Map<string, string>();
  let offset = 0;
  while (offset + 4 <= bytes.length) {
    const id = bytes.subarray(offset, offset + 2).toString('ascii');
    const length = Number(
      bytes.subarray(offset + 2, offset + 4).toString('ascii'),
    );
    if (!Number.isInteger(length) || offset + 4 + length > bytes.length) break;
    fields.set(
      id,
      bytes.subarray(offset + 4, offset + 4 + length).toString('utf8'),
    );
    offset += 4 + length;
  }
  return fields;
}

describe('ImportPaymentQrPdfService', () => {
  it('prints school, class and student name without diacritics as the payment content', () => {
    const content = paymentSlipContent(
      'Trường Tiểu học Võ Thị Sáu',
      'Lớp 3A4',
      'Phan Dương Linh Đan',
    );
    expect(content).toBe(
      'Truong Tieu hoc Vo Thi Sau - Lop 3A4 - Phan Duong Linh Dan',
    );

    const payload = paymentSlipQrPayload({
      bankBin: '970415',
      accountNumber: '1ICS261023000001',
      accountName: 'CTCP GIAO DUC KHCN ICHI SKILL',
      amount: new Decimal(560000),
      content,
      reusable: false,
    });
    const additionalData = tlvFields(payload).get('62');
    expect(additionalData).toBeDefined();
    expect(tlvFields(additionalData!).get('08')).toBe(content);
  });

  it('uses the exact VietinBank payload for a saved dynamic order', () => {
    const bankIssuedPayload =
      '00020101021238630010A0000007270133000697041501192ICS69D2610270004880208QRIBFTTA530370454065600005802VN62160812261027000488630432DB';

    expect(
      paymentSlipQrPayload({
        bankBin: '970415',
        accountNumber: '2ICS69D261027000488',
        accountName: 'CTCP GIAO DUC KHCN ICHI SKILL',
        amount: new Decimal(560000),
        content: 'TH Demo - Lớp 1A1 - Học sinh có tên rất dài để tái hiện lỗi',
        reusable: false,
        storedQrPayload: bankIssuedPayload,
      }),
    ).toBe(bankIssuedPayload);
  });

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
