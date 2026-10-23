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
  const service = new ImportPaymentQrPdfService(
    schoolRepository as never,
    academicYearRepository as never,
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
    } as ImportSession;

    const pdf = await service.create(session);

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)).toHaveLength(2);
  });
});
