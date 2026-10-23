import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { App } from 'supertest/types';
import { In, Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { SchoolsService } from '../src/schools/schools.service';
import { UsersService } from '../src/users/users.service';
import { AcademicYearsService } from '../src/academic-years/academic-years.service';
import { Role } from '../src/common/enums/role.enum';
import {
  AcademicYearStatus,
  PaymentOrderStatus,
  ReceivableStatus,
} from '../src/common/enums/status.enum';
import { PaymentOrder } from '../src/payment-orders/entities/payment-order.entity';
import { StudentReceivable } from '../src/receivables/entities/student-receivable.entity';
import { Student } from '../src/students/entities/student.entity';
import { FeePlan } from '../src/fee-plans/entities/fee-plan.entity';
import { Receipt } from '../src/receipts/entities/receipt.entity';

jest.setTimeout(60_000);

interface ListRow {
  name: string;
  dob: string | Date;
  phone: string;
  id: string;
  amount: number | null;
  content: string;
}

/** A workbook laid out like the school's list: title row, header row 2. */
async function listWorkbook(rows: ListRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Danh sách');
  sheet.mergeCells('A1:H1');
  sheet.getCell('A1').value = {
    richText: [
      { font: { bold: true }, text: 'DANH SÁCH BỔ SUNG LỚP 3A4 TH VÕ THỊ SÁU' },
    ],
  };
  sheet.getRow(2).values = [
    'STT',
    'HỌ VÀ TÊN',
    'NGÀY/THÁNG/NĂ\nM SINH',
    'SĐT PHỤ HUYNH',
    'MÃ ĐỊNH DANH CCCD',
    'GHI CHÚ',
    'SỐ TIỀN',
    'NỘI DUNG',
  ];
  rows.forEach((row, index) => {
    sheet.getRow(index + 3).values = [
      index + 1,
      row.name,
      row.dob,
      row.phone,
      row.id,
      null,
      row.amount,
      row.content,
    ];
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('Import danh sách thu → PDF QR + lưu để gạch nợ (e2e)', () => {
  const runId = Date.now().toString(36);
  const idBase = String(Date.now()).slice(-9);
  const listRows: ListRow[] = [
    {
      name: 'Phan Dương Linh Đan',
      dob: '21/09/2018',
      phone: '0358228913',
      id: `071${idBase}`,
      amount: 560000,
      content: `HV071${idBase} THVTS Lớp 3A4 Phan Dương Linh Đan`,
    },
    {
      name: 'Lê Chấn Hưng',
      dob: new Date(Date.UTC(2019, 9, 8)),
      phone: '0918569863',
      id: `072${idBase}`,
      amount: 560000,
      content: `HV072${idBase} THVTS Lớp 3A4 Lê Chấn Hưng`,
    },
  ];
  const expiry = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(Date.now() + 30 * 86_400_000));

  let app: INestApplication<App>;
  let token: string;
  let schoolId: string;
  let academicYearId: string;
  let noBankSchoolId: string;
  let noBankYearId: string;
  let orders: Repository<PaymentOrder>;
  let receivables: Repository<StudentReceivable>;
  let students: Repository<Student>;
  let feePlans: Repository<FeePlan>;
  let receipts: Repository<Receipt>;

  const api = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const preview = (
    file: Buffer,
    fields: Record<string, string>,
    target = { schoolId, academicYearId },
  ) => {
    const req = api()
      .post('/imports/excel/preview')
      .set(auth())
      .attach('file', file, 'danh-sach-3A4.xlsx')
      .field('type', 'STUDENTS')
      .field('schoolId', target.schoolId)
      .field('academicYearId', target.academicYearId);
    for (const [key, value] of Object.entries(fields)) {
      void req.field(key, value);
    }
    return req;
  };
  const confirm = (importSessionId: string) =>
    api()
      .post('/imports/excel/confirm')
      .set(auth())
      .send({ importSessionId })
      .expect(201)
      .then(
        (res) =>
          (
            res.body as {
              data: {
                classesCreated: number;
                studentsCreated: number;
                studentsMatched: number;
                receivablesCreated: number;
                paymentOrdersCreated: number;
                paymentOrders: {
                  rowNumber: number;
                  paymentOrderId: string;
                  orderCode: string;
                }[];
              };
            }
          ).data,
      );

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    orders = app.get(getRepositoryToken(PaymentOrder));
    receivables = app.get(getRepositoryToken(StudentReceivable));
    students = app.get(getRepositoryToken(Student));
    feePlans = app.get(getRepositoryToken(FeePlan));
    receipts = app.get(getRepositoryToken(Receipt));

    const schools = app.get(SchoolsService);
    const years = app.get(AcademicYearsService);
    const school = await schools.create({
      code: `VTS${runId}`.toUpperCase(),
      name: `TH Võ Thị Sáu ${runId}`,
      bankName: 'VietinBank',
      bankCode: '970415',
      bankAccountNumber: '118636563979',
      bankAccountName: 'CTCP GIAO DUC KHCN ICHI SKILL',
    });
    schoolId = school.id;
    academicYearId = (
      await years.create({
        schoolId,
        name: '2026-2027',
        startDate: '2026-09-01',
        endDate: '2027-08-31',
        status: AcademicYearStatus.ACTIVE,
      })
    ).id;
    const noBank = await schools.create({
      code: `NOB${runId}`.toUpperCase(),
      name: `Trường chưa có TK ${runId}`,
    });
    noBankSchoolId = noBank.id;
    noBankYearId = (
      await years.create({
        schoolId: noBankSchoolId,
        name: '2026-2027',
        startDate: '2026-09-01',
        endDate: '2027-08-31',
        status: AcademicYearStatus.ACTIVE,
      })
    ).id;

    const password = 'Test@123456';
    const user = await app.get(UsersService).create({
      email: `import-list-${runId}@test.local`,
      password,
      fullName: 'Kế toán import',
      role: Role.SUPER_ADMIN,
    });
    token = (
      (
        await api()
          .post('/auth/login')
          .send({ email: user.email, password })
          .expect(201)
      ).body as { data: { accessToken: string } }
    ).data.accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  let firstImport: Awaited<ReturnType<typeof confirm>>;

  it('xem trước: đọc tiêu đề, cột ngày sinh xuống dòng, lớp từ tiêu đề, số tiền và nội dung', async () => {
    const res = await preview(await listWorkbook(listRows), {
      createPaymentOrders: 'true',
      qrExpiresAt: expiry,
    }).expect(201);
    const data = (
      res.body as {
        data: {
          importSessionId: string;
          validRows: number;
          errors: unknown[];
          rows: {
            className: string;
            originalAmount: string;
            dateOfBirth: string;
          }[];
          paymentOptions: Record<string, unknown>;
        };
      }
    ).data;
    expect(data.errors).toEqual([]);
    expect(data.validRows).toBe(2);
    expect(data.rows.map((row) => row.className)).toEqual(['3A4', '3A4']);
    expect(data.rows.map((row) => row.originalAmount)).toEqual([
      '560000.00',
      '560000.00',
    ]);
    expect(data.rows[1].dateOfBirth).toBe('2019-10-08');
    expect(data.paymentOptions).toEqual({
      createPaymentOrders: true,
      qrExpiresAt: expiry,
      title: 'DANH SÁCH BỔ SUNG LỚP 3A4 TH VÕ THỊ SÁU',
    });

    firstImport = await confirm(data.importSessionId);
    expect(firstImport).toMatchObject({
      classesCreated: 1,
      studentsCreated: 2,
      studentsMatched: 0,
      receivablesCreated: 2,
      paymentOrdersCreated: 2,
    });

    const pdf = await api()
      .get(`/imports/${data.importSessionId}/payment-qr.pdf`)
      .set(auth())
      .buffer(true)
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('lưu để gạch nợ: công nợ đúng số tiền trong khoản thu riêng, đơn có hạn với QR VietQR vào TK trường', async () => {
    const saved = await orders.find({
      where: { id: In(firstImport.paymentOrders.map((o) => o.paymentOrderId)) },
      relations: { items: true },
      order: { orderCode: 'ASC' },
    });
    expect(saved).toHaveLength(2);
    for (const order of saved) {
      expect(order.status).toBe(PaymentOrderStatus.PENDING);
      expect(order.transferContent).toBe(order.orderCode);
      expect(order.requestedAmount.toFixed(0)).toBe('560000');
      expect(order.bankAccountNumber).toBe('118636563979');
      expect(order.expiresAt?.toISOString()).toBe(
        new Date(`${expiry}T23:59:59+07:00`).toISOString(),
      );
      // Dynamic VietQR (expiring), account 118636563979 at VietinBank.
      expect(order.qrPayload).toMatch(/^000201010212/);
      expect(order.qrPayload).toContain('0006970415' + '0112118636563979');
    }
    expect(saved.map((o) => o.legacyTransferContent).sort()).toEqual(
      [
        `HV071${idBase} THVTS Lop 3A4 Phan Duong Linh Dan`,
        `HV072${idBase} THVTS Lop 3A4 Le Chan Hung`,
      ].sort(),
    );

    const debts = await receivables.find({
      where: { id: In(saved.map((o) => o.items[0].receivableId)) },
    });
    expect(debts.map((d) => d.amountDue.toFixed(0))).toEqual([
      '560000',
      '560000',
    ]);
    const plan = await feePlans.findOneByOrFail({ id: debts[0].feePlanId });
    expect(plan.name).toBe('DANH SÁCH BỔ SUNG LỚP 3A4 TH VÕ THỊ SÁU');
    expect(debts[1].feePlanId).toBe(plan.id);
  });

  it('nhập lại danh sách, không thời hạn: đối chiếu học sinh theo mã định danh, không tạo trùng; QR tĩnh, đơn không hết hạn', async () => {
    const res = await preview(await listWorkbook(listRows), {
      createPaymentOrders: 'true',
    }).expect(201);
    const sessionId = (res.body as { data: { importSessionId: string } }).data
      .importSessionId;
    const second = await confirm(sessionId);
    expect(second).toMatchObject({
      classesCreated: 0,
      studentsCreated: 0,
      studentsMatched: 2,
      receivablesCreated: 2,
      paymentOrdersCreated: 2,
    });
    expect(
      await students.countBy({
        schoolId,
        identifierCode: In(listRows.map((row) => row.id)),
      }),
    ).toBe(2);
    const reusable = await orders.find({
      where: { id: In(second.paymentOrders.map((o) => o.paymentOrderId)) },
    });
    for (const order of reusable) {
      expect(order.expiresAt).toBeNull();
      expect(order.qrPayload).toMatch(/^000201010211/);
    }
  });

  it('kế toán ghi nhận tiền về trên đơn → gạch nợ và xuất phiếu thu', async () => {
    const [target] = firstImport.paymentOrders;
    await api()
      .post('/payment-transactions/manual')
      .set(auth())
      .send({
        externalTransactionId: `VTB-${runId}`,
        amount: '560000',
        transferContent: target.orderCode,
        transactionTime: new Date().toISOString(),
      })
      .expect(201);
    const order = await orders.findOneOrFail({
      where: { id: target.paymentOrderId },
      relations: { items: true },
    });
    expect(order.status).toBe(PaymentOrderStatus.PAID);
    const debt = await receivables.findOneByOrFail({
      id: order.items[0].receivableId,
    });
    expect(debt.status).toBe(ReceivableStatus.PAID);
    expect(await receipts.countBy({ studentId: order.studentId })).toBe(1);
  });

  it('lỗi: thiếu số tiền ở dòng, trường chưa có tài khoản, ngày hết hạn đã qua', async () => {
    const missingAmount = await preview(
      await listWorkbook([
        { ...listRows[0], id: `073${idBase}`, amount: null },
      ]),
      { createPaymentOrders: 'true' },
    ).expect(201);
    expect(
      (
        missingAmount.body as { data: { errors: { message: string }[] } }
      ).data.errors.map((e) => e.message),
    ).toContain('Thiếu số tiền cần thu');

    const noBank = await preview(
      await listWorkbook(listRows),
      { createPaymentOrders: 'true' },
      { schoolId: noBankSchoolId, academicYearId: noBankYearId },
    ).expect(400);
    expect(JSON.stringify(noBank.body)).toContain('mã ngân hàng');

    await preview(await listWorkbook(listRows), {
      createPaymentOrders: 'true',
      qrExpiresAt: '2020-01-01',
    }).expect(400);
  });
});
