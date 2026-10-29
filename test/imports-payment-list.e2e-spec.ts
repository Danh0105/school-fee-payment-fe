import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { App } from 'supertest/types';
import { In, Repository } from 'typeorm';
import { SchoolsService } from '../src/schools/schools.service';
import { UsersService } from '../src/users/users.service';
import { AcademicYearsService } from '../src/academic-years/academic-years.service';
import { Role } from '../src/common/enums/role.enum';
import {
  AcademicYearStatus,
  PaymentMethod,
  PaymentOrderStatus,
  ReceivableStatus,
} from '../src/common/enums/status.enum';
import { buildVietQrPayload } from '../src/common/utils/vietqr.util';
import { PaymentOrder } from '../src/payment-orders/entities/payment-order.entity';
import { StudentReceivable } from '../src/receivables/entities/student-receivable.entity';
import { Student } from '../src/students/entities/student.entity';
import { FeePlan } from '../src/fee-plans/entities/fee-plan.entity';
import { Receipt } from '../src/receipts/entities/receipt.entity';
import {
  GenerateQrInput,
  ViettinbankApiService,
} from '../src/viettinbank/viettinbank-api.service';
import { CryptoKeyService } from '../src/viettinbank/crypto-key.service';
import { EInvoice } from '../src/modules/einvoice/entities/einvoice.entity';
import { EInvoiceConfig } from '../src/modules/einvoice/entities/einvoice-config.entity';
import {
  EInvoiceIssueMode,
  EInvoiceStatus,
} from '../src/modules/einvoice/entities/einvoice.enums';
import {
  E_INVOICE_PROVIDER,
  EInvoiceProvider,
} from '../src/modules/einvoice/providers/einvoice-provider.interface';

jest.setTimeout(60_000);

const VAC = '2ICS69D';

interface ListRow {
  name: string;
  id: string;
  amount: number | null;
  content: string;
}

const ITEM_NAME =
  'Chương trình giáo dục Trí tuệ nhân tạo (AI) và STEM ICHI SKILL năm học 2026-2027 (7 tháng)';
const BUYER_ADDRESS =
  'Lớp 3A4 Trường TH Demo, Phường Mẫu, Tỉnh Mẫu';

/** A workbook laid out like the school's list: title row, header row 2. */
async function listWorkbook(rows: ListRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Danh sách');
  sheet.mergeCells('A1:N1');
  sheet.getCell('A1').value = {
    richText: [
      { font: { bold: true }, text: 'DANH SÁCH BỔ SUNG LỚP 3A4 TH VÕ THỊ SÁU' },
    ],
  };
  sheet.getRow(2).values = [
    'STT',
    'HỌ VÀ TÊN',
    'LỚP',
    'MÃ ĐỊNH DANH',
    'SỐ TIỀN',
    'NỘI DUNG',
    'HỌ TÊN NGƯỜI MUA HÀNG',
    'ĐỊA CHỈ',
    'CCCD NGƯỜI MUA',
    'TÊN HÀNG HÓA, DỊCH VỤ',
    'ĐƠN VỊ TÍNH',
    'SỐ LƯỢNG',
    'ĐƠN GIÁ',
    'THÀNH TIỀN',
  ];
  rows.forEach((row, index) => {
    sheet.getRow(index + 3).values = [
      index + 1,
      row.name,
      '3A4',
      row.id,
      row.amount,
      row.content,
      row.name,
      BUYER_ADDRESS,
      row.id,
      ITEM_NAME,
      'Học sinh',
      1,
      row.amount,
      row.amount,
    ];
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

interface ConfirmBody {
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
}

describe('Import danh sách thu → QR động VietinBank, lưu để gạch nợ (e2e)', () => {
  const runId = Date.now().toString(36);
  const idBase = String(Date.now()).slice(-9);
  const listRows: ListRow[] = [
    {
      name: 'Phan Dương Linh Đan',
      id: `071${idBase}`,
      amount: 560000,
      content: `HV071${idBase} THVTS Lớp 3A4 Phan Dương Linh Đan`,
    },
    {
      name: 'Lê Chấn Hưng',
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
  /** The school has no bank account: the money goes to the company's. */
  let schoolId: string;
  let academicYearId: string;
  let generateQr: jest.SpyInstance;
  let orders: Repository<PaymentOrder>;
  let receivables: Repository<StudentReceivable>;
  let students: Repository<Student>;
  let feePlans: Repository<FeePlan>;
  let receipts: Repository<Receipt>;
  let einvoices: Repository<EInvoice>;
  let einvoiceConfigs: Repository<EInvoiceConfig>;
  let createDraft: jest.SpyInstance;

  const api = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const preview = (file: Buffer, fields: Record<string, string>) => {
    const req = api()
      .post('/imports/excel/preview')
      .set(auth())
      .attach('file', file, 'danh-sach-3A4.xlsx')
      .field('type', 'STUDENTS')
      .field('schoolId', schoolId)
      .field('academicYearId', academicYearId);
    for (const [key, value] of Object.entries(fields)) {
      void req.field(key, value);
    }
    return req;
  };
  const sessionIdOf = (res: request.Response) =>
    (res.body as { data: { importSessionId: string } }).data.importSessionId;
  const confirm = (importSessionId: string) =>
    api()
      .post('/imports/excel/confirm')
      .set(auth())
      .send({ importSessionId })
      .expect(201)
      .then((res) => (res.body as { data: ConfirmBody }).data);
  const pdf = (importSessionId: string) =>
    api()
      .get(`/imports/${importSessionId}/payment-qr.pdf`)
      .set(auth())
      .buffer(true);
  /** The order's e-invoice once the queue worker has drafted it on Viettel. */
  const draftOf = async (paymentOrderId: string) => {
    for (let i = 0; i < 50; i += 1) {
      const invoice = await einvoices.findOneBy({ paymentOrderId });
      if (invoice?.status === EInvoiceStatus.DRAFT) return invoice;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return einvoices.findOneBy({ paymentOrderId });
  };

  beforeAll(async () => {
    Object.assign(process.env, {
      VIETINBANK_ACCOUNT: VAC,
      VIETINBANK_ACCOUNT_NAME: 'CTCP GIAO DUC KHCN ICHI SKILL',
      // As on production: Viettel on, real issuance off, drafts allowed.
      VIETTEL_SINVOICE_ENABLED: 'true',
      VIETTEL_SINVOICE_AUTO_ISSUE: 'false',
      VIETTEL_SINVOICE_TAX_CODE: '0316660845',
      VIETTEL_SINVOICE_TEMPLATE_CODE: '1/001',
      VIETTEL_SINVOICE_SERIES: 'C26TIS',
      VIETTEL_SINVOICE_BASE_URL: 'http://127.0.0.1:9/api/',
      VIETTEL_SINVOICE_AUTH_URL: 'http://127.0.0.1:9/auth/login',
    });
    // Loaded only now so ConfigModule sees the settings above.
    const { AppModule } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../src/app.module') as typeof import('../src/app.module');
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

    // VietinBank's generate-QR answers with the EMV payload of the virtual
    // account it was asked for.
    generateQr = jest
      .spyOn(app.get(ViettinbankApiService), 'generateQr')
      .mockImplementation((input: GenerateQrInput) =>
        Promise.resolve({
          requestId: 'r',
          providerId: '10080',
          merchantId: '10080',
          clientDt: new Date().toISOString(),
          status: { statusCode: '00' },
          signature: 'bank-signature',
          data: {
            base64QRCode: Buffer.from(
              buildVietQrPayload({
                bankBin: '970415',
                accountNumber: input.accountNumber,
                amount: String(input.amount),
                addInfo: input.purposeOfTrans,
              }),
            ).toString('base64'),
          },
        }),
      );
    const crypto = app.get(CryptoKeyService);
    jest.spyOn(crypto, 'verifyNotify').mockReturnValue('NOTIFY');
    jest.spyOn(crypto, 'sign').mockReturnValue('signed');
    createDraft = jest
      .spyOn(
        app.get<EInvoiceProvider>(E_INVOICE_PROVIDER),
        'createOrUpdateInvoiceDraft',
      )
      .mockResolvedValue({ transactionID: `VT-DRAFT-${runId}` });

    orders = app.get(getRepositoryToken(PaymentOrder));
    receivables = app.get(getRepositoryToken(StudentReceivable));
    students = app.get(getRepositoryToken(Student));
    feePlans = app.get(getRepositoryToken(FeePlan));
    receipts = app.get(getRepositoryToken(Receipt));
    einvoices = app.get(getRepositoryToken(EInvoice));
    einvoiceConfigs = app.get(getRepositoryToken(EInvoiceConfig));

    const school = await app.get(SchoolsService).create({
      code: `VTS${runId}`.toUpperCase(),
      name: `TH Võ Thị Sáu ${runId}`,
    });
    schoolId = school.id;
    academicYearId = (
      await app.get(AcademicYearsService).create({
        schoolId,
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

  let firstImport: ConfirmBody;
  let secondImport: ConfirmBody;

  it('xem trước file như ảnh; PDF chỉ có sau khi lưu; lưu tạo lớp, học sinh, công nợ, đơn VietinBank (trường không cần tài khoản)', async () => {
    const res = await preview(await listWorkbook(listRows), {
      createPaymentOrders: 'true',
      qrExpiresAt: expiry,
      serviceName: 'Học phí chương trình Kỹ năng sống',
    }).expect(201);
    const data = (
      res.body as {
        data: {
          validRows: number;
          errors: unknown[];
          rows: {
            className: string;
            originalAmount: string;
            buyerName: string;
            unitName: string;
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
    expect(data.rows[0]).toMatchObject({
      buyerName: listRows[0].name,
      unitName: 'Học sinh',
    });
    expect(data.paymentOptions).toEqual({
      createPaymentOrders: true,
      qrExpiresAt: expiry,
      title: 'DANH SÁCH BỔ SUNG LỚP 3A4 TH VÕ THỊ SÁU',
      serviceName: 'Học phí chương trình Kỹ năng sống',
    });

    const sessionId = sessionIdOf(res);
    await pdf(sessionId).expect(400);

    firstImport = await confirm(sessionId);
    expect(firstImport).toMatchObject({
      classesCreated: 1,
      studentsCreated: 2,
      studentsMatched: 0,
      receivablesCreated: 2,
      paymentOrdersCreated: 2,
    });

    const slips = await pdf(sessionId).expect(200);
    expect(slips.headers['content-type']).toContain('application/pdf');
    expect((slips.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('đơn dùng QR động tài khoản ảo VietinBank (tiền về công ty), có hạn; công nợ đúng số tiền trong khoản thu riêng', async () => {
    const saved = await orders.find({
      where: {
        id: In(firstImport.paymentOrders.map((o) => o.paymentOrderId)),
      },
      relations: { items: true },
    });
    expect(saved).toHaveLength(2);
    for (const order of saved) {
      const vav = order.orderCode.slice(3);
      expect(order).toMatchObject({
        status: PaymentOrderStatus.PENDING,
        paymentMethod: PaymentMethod.VIETINBANK,
        transferContent: vav,
        bankAccountNumber: `${VAC}${vav}`,
      });
      expect(order.requestedAmount.toFixed(0)).toBe('560000');
      expect(order.expiresAt?.toISOString()).toBe(
        new Date(`${expiry}T23:59:59+07:00`).toISOString(),
      );
      expect(order.qrPayload).toContain(`0119${VAC}${vav}`);
    }
    expect(generateQr).toHaveBeenCalledWith(
      expect.objectContaining({
        accountNumber: `${VAC}${saved[0].transferContent}`,
        amount: 560000,
      }),
    );
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
    // The row's eight invoice fields win over the generic import option.
    expect(debts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: ITEM_NAME,
          invoiceBuyerAddress: BUYER_ADDRESS,
          invoiceUnitName: 'Học sinh',
        }),
      ]),
    );
    expect(debts.map((d) => d.quantity.toFixed(0))).toEqual(['1', '1']);
    expect(debts.map((d) => d.unitPrice.toFixed(0))).toEqual([
      '560000',
      '560000',
    ]);
  });

  it('nhập lại danh sách, không thời hạn: đối chiếu học sinh theo mã định danh, không tạo trùng; đơn không hết hạn', async () => {
    const res = await preview(await listWorkbook(listRows), {
      createPaymentOrders: 'true',
    }).expect(201);
    secondImport = await confirm(sessionIdOf(res));
    expect(secondImport).toMatchObject({
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
      where: {
        id: In(secondImport.paymentOrders.map((o) => o.paymentOrderId)),
      },
    });
    expect(reusable.map((o) => o.expiresAt)).toEqual([null, null]);
  });

  it('VietinBank báo tiền về (notify-bill) → tự gạch nợ, xuất phiếu thu và hóa đơn nháp Viettel', async () => {
    // The school never saved e-invoice settings.
    expect(await einvoiceConfigs.existsBy({ schoolId })).toBe(false);

    const [target] = secondImport.paymentOrders;
    const order = await orders.findOneByOrFail({ id: target.paymentOrderId });
    const res = await api()
      .post('/api/v1/notify-bill')
      .send({
        transId: `VTB${runId}`,
        transTime: '20261023100000',
        custCode: `${VAC}${order.transferContent}`,
        amount: '560000',
        bankTransId: `B${runId}`,
        remark: 'CT DEN',
        providerId: '10080',
        signature: 'bank-signature',
      })
      .expect(201);
    expect((res.body as { errorCode: string }).errorCode).toBe('00');

    const paid = await orders.findOneOrFail({
      where: { id: order.id },
      relations: { items: true },
    });
    expect(paid.status).toBe(PaymentOrderStatus.PAID);
    const debt = await receivables.findOneByOrFail({
      id: paid.items[0].receivableId,
    });
    expect(debt.status).toBe(ReceivableStatus.PAID);

    expect(await einvoiceConfigs.findOneByOrFail({ schoolId })).toMatchObject({
      enabled: true,
      autoIssue: true,
      issueMode: EInvoiceIssueMode.DRAFT,
      supplierTaxCode: '0316660845',
      templateCode: '1/001',
      invoiceSeries: 'C26TIS',
      metadata: { source: 'SYSTEM_DEFAULT' },
    });
    const draft = await draftOf(order.id);
    expect(draft).toMatchObject({
      status: EInvoiceStatus.DRAFT,
      transactionId: `VT-DRAFT-${runId}`,
      invoiceSeries: 'C26TIS',
    });
    expect(draft?.receiptId).toBeTruthy();
    expect(createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        buyerInfo: expect.objectContaining({
          buyerName: listRows[0].name,
          buyerIdNo: listRows[0].id,
          buyerAddressLine: BUYER_ADDRESS,
        }) as unknown,
        // The imported goods/service description is preserved verbatim.
        itemInfo: [
          expect.objectContaining({
            itemName: ITEM_NAME,
            unitName: 'Học sinh',
            quantity: 1,
            unitPrice: 560000,
          }),
        ] as unknown,
      }),
      '0316660845',
    );
  });

  it('kế toán ghi nhận tay bằng mã đơn trên đơn VietinBank → gạch nợ, xuất phiếu thu', async () => {
    const [target] = firstImport.paymentOrders;
    await api()
      .post('/payment-transactions/manual')
      .set(auth())
      .send({
        externalTransactionId: `MAN-${runId}`,
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
    expect(await receipts.countBy({ studentId: order.studentId })).toBe(2);
    expect((await draftOf(order.id))?.status).toBe(EInvoiceStatus.DRAFT);
  });

  it('lỗi: thiếu số tiền ở dòng, ngày hết hạn đã qua', async () => {
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

    await preview(await listWorkbook(listRows), {
      createPaymentOrders: 'true',
      qrExpiresAt: '2020-01-01',
    }).expect(400);
  });
});
