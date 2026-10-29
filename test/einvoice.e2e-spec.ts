import { createServer, IncomingHttpHeaders, Server } from 'http';
import { AddressInfo } from 'net';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { Queue } from 'bullmq';
import JSZip from 'jszip';
import request from 'supertest';
import { App } from 'supertest/types';
import { Repository } from 'typeorm';
import { SchoolsService } from '../src/schools/schools.service';
import { UsersService } from '../src/users/users.service';
import { AcademicYearsService } from '../src/academic-years/academic-years.service';
import { ClassesService } from '../src/classes/classes.service';
import { StudentsService } from '../src/students/students.service';
import { StudentClassesService } from '../src/student-classes/student-classes.service';
import { FeeCategoriesService } from '../src/fee-categories/fee-categories.service';
import { FeePlansService } from '../src/fee-plans/fee-plans.service';
import { FeeAssignmentsService } from '../src/fee-assignments/fee-assignments.service';
import { ReceivablesService } from '../src/receivables/receivables.service';
import { PaymentOrdersService } from '../src/payment-orders/payment-orders.service';
import { PaymentTransactionsService } from '../src/payment-transactions/payment-transactions.service';
import { ReconciliationService } from '../src/reconciliation/reconciliation.service';
import { CryptoKeyService } from '../src/viettinbank/crypto-key.service';
import { ViettinbankApiService } from '../src/viettinbank/viettinbank-api.service';
import { EInvoiceService } from '../src/modules/einvoice/einvoice.service';
import { EInvoice } from '../src/modules/einvoice/entities/einvoice.entity';
import { EInvoiceAttempt } from '../src/modules/einvoice/entities/einvoice-attempt.entity';
import { EInvoiceEvent } from '../src/modules/einvoice/entities/einvoice-event.entity';
import { EInvoiceFile } from '../src/modules/einvoice/entities/einvoice-file.entity';
import {
  EInvoiceAttemptOperation,
  EInvoiceAttemptStatus,
  EInvoiceIssueMode,
  EInvoiceStatus,
} from '../src/modules/einvoice/entities/einvoice.enums';
import { E_INVOICE_QUEUES } from '../src/modules/einvoice/providers/viettel/viettel-sinvoice.constants';
import { School } from '../src/schools/entities/school.entity';
import { Receipt } from '../src/receipts/entities/receipt.entity';
import { AcademicYear } from '../src/academic-years/entities/academic-year.entity';
import { Class } from '../src/classes/entities/class.entity';
import { FeeCategory } from '../src/fee-categories/entities/fee-category.entity';
import { Student } from '../src/students/entities/student.entity';
import { PaymentOrder } from '../src/payment-orders/entities/payment-order.entity';
import { Role } from '../src/common/enums/role.enum';
import {
  AcademicYearStatus,
  FeeAssignmentTargetType,
  FeePlanStatus,
  PaymentMethod,
  PaymentOrderStatus,
  PaymentProviderCode,
  PaymentTransactionStatus,
  ReceivableStatus,
} from '../src/common/enums/status.enum';

jest.setTimeout(90_000);

const TAX_CODE = '0100109106-501';
const API_PREFIX = '/services/einvoiceapplication/api/';

interface MockCall {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  json?: Record<string, unknown>;
  form?: Record<string, string>;
}

/** Shape of the 7.2 createInvoice body, as far as these tests inspect it. */
interface IssuePayload {
  generalInvoiceInfo: Record<string, unknown> & { transactionUuid: string };
  buyerInfo: Record<string, unknown>;
  payments: Record<string, unknown>[];
  itemInfo: Record<string, unknown>[];
  summarizeInfo: Record<string, unknown>;
  taxBreakdowns: Record<string, unknown>[];
}

const issuePayload = (call: MockCall): IssuePayload =>
  call.json as unknown as IssuePayload;

interface MockReply {
  status: number;
  body: unknown;
  delayMs?: number;
}

/** 7.3 fileType=ZIP as Viettel ships it: the signed XML next to its PDF. */
function fakeInvoiceZip(invoiceNo: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(`${invoiceNo}.xml`, `<HDon><SHDon>${invoiceNo}</SHDon></HDon>`);
  zip.file(`${invoiceNo}.pdf`, `FAKE-PDF-${invoiceNo}`);
  return zip.generateAsync({ type: 'nodebuffer' });
}

/**
 * In-process stand-in for Viettel S-Invoice: token login, 7.2 createInvoice,
 * 7.21 searchInvoiceByTransactionUuid, 7.3 representation file, 7.33 email
 * and 7.9 cancel. Every call is recorded so tests can assert the wire format.
 */
class ViettelSinvoiceMock {
  readonly calls: MockCall[] = [];
  readonly invoices = new Map<
    string,
    { invoiceNo: string; transactionID: string; ready: boolean }
  >();
  /** 7.8 drafts waiting on the portal, by transactionUuid. */
  readonly drafts = new Map<string, { transactionID: string }>();
  token = 'tok-1';
  logins = 0;
  /** 'sync': 7.2 returns invoiceNo; 'async': invoiceNo="" until 7.21 is called. */
  issueMode: 'sync' | 'async' = 'async';
  /** 7.21 keeps answering invoiceNo="" (Viettel never assigns a number). */
  searchNeverReady = false;
  /** One-shot overrides for the next 7.2 calls, consumed in order. */
  nextIssueReplies: MockReply[] = [];
  private seq = 0;
  private server: Server;

  async start(): Promise<string> {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        const call: MockCall = {
          method: req.method ?? '',
          path: req.url ?? '',
          headers: req.headers,
        };
        if ((req.headers['content-type'] ?? '').includes('json') && raw) {
          call.json = JSON.parse(raw) as Record<string, any>;
        } else if (raw) {
          call.form = Object.fromEntries(new URLSearchParams(raw));
        }
        this.calls.push(call);
        void Promise.resolve(this.handle(call)).then((reply) => {
          setTimeout(() => {
            res.writeHead(reply.status, {
              'Content-Type': 'application/json',
            });
            res.end(JSON.stringify(reply.body));
          }, reply.delayMs ?? 0);
        });
      });
    });
    await new Promise<void>((resolve) =>
      this.server.listen(0, '127.0.0.1', resolve),
    );
    const { port } = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  stop(): Promise<void> {
    return new Promise((resolve) => this.server.close(() => resolve()));
  }

  rotateToken(): void {
    this.token = `tok-${Number(this.token.split('-')[1]) + 1}`;
  }

  callsTo(fragment: string): MockCall[] {
    return this.calls.filter((call) => call.path.includes(fragment));
  }

  draftCallsFor(uuid: string): MockCall[] {
    return this.callsTo('/createOrUpdateInvoiceDraft/').filter(
      (call) => issuePayload(call).generalInvoiceInfo.transactionUuid === uuid,
    );
  }

  /** The accountant signs the draft on vinvoice.viettel.vn: it gets a number. */
  signDraft(uuid: string): void {
    const draft = this.drafts.get(uuid);
    if (!draft) throw new Error(`No draft ${uuid}`);
    this.drafts.delete(uuid);
    this.seq += 1;
    this.invoices.set(uuid, {
      invoiceNo: `K26TAA${String(this.seq).padStart(7, '0')}`,
      transactionID: draft.transactionID,
      ready: true,
    });
  }

  issueCallsFor(uuid: string): MockCall[] {
    return this.callsTo('/createInvoice/').filter(
      (call) => issuePayload(call).generalInvoiceInfo.transactionUuid === uuid,
    );
  }

  private handle(call: MockCall): MockReply | Promise<MockReply> {
    if (call.path === '/auth/login') {
      if (
        call.json?.username !== 'e2e-user' ||
        call.json?.password !== 'e2e-pass'
      ) {
        return { status: 401, body: { message: 'Bad credentials' } };
      }
      this.logins += 1;
      return { status: 200, body: { access_token: this.token } };
    }
    if (!call.path.startsWith(API_PREFIX)) {
      return { status: 404, body: { message: 'Not found' } };
    }
    if (call.headers.cookie !== `access_token=${this.token}`) {
      return { status: 401, body: { message: 'Unauthorized' } };
    }
    const path = call.path.slice(API_PREFIX.length);

    if (path.startsWith('InvoiceAPI/InvoiceWS/createInvoice/')) {
      const uuid = issuePayload(call).generalInvoiceInfo.transactionUuid;
      const override = this.nextIssueReplies.shift();
      let invoice = this.invoices.get(uuid);
      if (!invoice) {
        this.seq += 1;
        invoice = {
          invoiceNo: `K26TAA${String(this.seq).padStart(7, '0')}`,
          transactionID: `TXN${randomUUID().slice(0, 8)}`,
          ready: this.issueMode === 'sync',
        };
        // A business error means Viettel did not create anything.
        if (!override || override.status >= 500 || override.delayMs) {
          this.invoices.set(uuid, invoice);
        }
      }
      if (override) return override;
      return {
        status: 200,
        body: {
          errorCode: null,
          description: null,
          result: {
            supplierTaxCode: TAX_CODE,
            invoiceNo: invoice.ready ? invoice.invoiceNo : '',
            transactionID: invoice.transactionID,
            reservationCode: `RC${invoice.transactionID}`,
          },
        },
      };
    }

    if (path.startsWith('InvoiceAPI/InvoiceWS/createOrUpdateInvoiceDraft/')) {
      const uuid = issuePayload(call).generalInvoiceInfo.transactionUuid;
      if (!this.drafts.has(uuid)) {
        this.drafts.set(uuid, {
          transactionID: `DRF${randomUUID().slice(0, 8)}`,
        });
      }
      // What Viettel production answered for a real 7.8 call: no number, no transactionID.
      return { status: 200, body: {} };
    }

    if (path === 'InvoiceAPI/InvoiceWS/searchInvoiceByTransactionUuid') {
      // An unsigned draft is found, with the bare series as invoiceNo.
      if (this.drafts.has(call.form?.transactionUuid ?? '')) {
        return {
          status: 200,
          body: {
            errorCode: null,
            description: null,
            result: [
              {
                supplierTaxCode: TAX_CODE,
                invoiceNo: 'K26TAA',
                reservationCode: null,
                status: 'Hóa đơn gốc',
              },
            ],
          },
        };
      }
      const invoice = this.invoices.get(call.form?.transactionUuid ?? '');
      if (!invoice) {
        return {
          status: 200,
          body: { errorCode: 'NOT_FOUND', description: 'Không tìm thấy' },
        };
      }
      if (!this.searchNeverReady) invoice.ready = true;
      return {
        status: 200,
        body: {
          errorCode: null,
          description: null,
          result: [
            {
              invoiceNo: invoice.ready ? invoice.invoiceNo : '',
              transactionID: invoice.transactionID,
              reservationCode: `RC${invoice.transactionID}`,
              status: 'Đã cấp số',
            },
          ],
        },
      };
    }

    if (path === 'InvoiceAPI/InvoiceUtilsWS/getInvoiceRepresentationFile') {
      const { fileType: type = 'PDF', invoiceNo } = call.json as {
        fileType?: string;
        invoiceNo: string;
      };
      if (type === 'ZIP') {
        return fakeInvoiceZip(invoiceNo).then((bytes) => ({
          status: 200,
          body: {
            errorCode: null,
            description: null,
            fileName: `${invoiceNo}.zip`,
            fileToBytes: bytes.toString('base64'),
          },
        }));
      }
      return {
        status: 200,
        body: {
          errorCode: null,
          description: null,
          fileName: `${invoiceNo}.${type.toLowerCase()}`,
          fileToBytes: Buffer.from(`FAKE-${type}-${invoiceNo}`).toString(
            'base64',
          ),
        },
      };
    }

    if (
      path === 'InvoiceAPI/InvoiceUtilsWS/sendEmailToCustomer' ||
      path === 'InvoiceAPI/InvoiceWS/cancelTransactionInvoice'
    ) {
      return { status: 200, body: { errorCode: null, description: null } };
    }

    return { status: 404, body: { message: `Unhandled ${path}` } };
  }
}

describe('E-invoice / Viettel S-Invoice (e2e, mocked Viettel)', () => {
  const mock = new ViettelSinvoiceMock();
  const runId = Date.now().toString(36);
  const storageDir = mkdtempSync(join(tmpdir(), 'einvoice-e2e-'));

  let app: INestApplication<App>;
  let queues: Queue[];
  let invoices: Repository<EInvoice>;
  let attempts: Repository<EInvoiceAttempt>;
  let events: Repository<EInvoiceEvent>;
  let files: Repository<EInvoiceFile>;
  let receipts: Repository<Receipt>;

  let einvoiceService: EInvoiceService;
  let studentsService: StudentsService;
  let studentClassesService: StudentClassesService;
  let feePlansService: FeePlansService;
  let feeAssignmentsService: FeeAssignmentsService;
  let receivablesService: ReceivablesService;
  let paymentOrdersService: PaymentOrdersService;
  let paymentTransactionsService: PaymentTransactionsService;
  let reconciliationService: ReconciliationService;
  let cryptoKeyService: CryptoKeyService;
  let viettinbankApiService: ViettinbankApiService;

  let schoolA: School;
  let schoolB: School;
  let academicYear: AcademicYear;
  let klass: Class;
  let feeCategory: FeeCategory;
  let userId: string;
  let accountantToken: string;
  let viewerToken: string;
  let otherSchoolToken: string;
  let seq = 0;

  const baseConfig = {
    enabled: true,
    autoIssue: true,
    supplierTaxCode: TAX_CODE,
    templateCode: '1/001',
    invoiceSeries: 'K26TAA',
    taxPercentage: '-2',
    issueMode: EInvoiceIssueMode.ISSUE,
  };

  beforeAll(async () => {
    const mockUrl = await mock.start();
    Object.assign(process.env, {
      VIETTEL_SINVOICE_ENABLED: 'true',
      VIETTEL_SINVOICE_AUTO_ISSUE: 'true',
      VIETTEL_SINVOICE_BASE_URL: `${mockUrl}${API_PREFIX}`,
      VIETTEL_SINVOICE_AUTH_URL: `${mockUrl}/auth/login`,
      VIETTEL_SINVOICE_USERNAME: 'e2e-user',
      VIETTEL_SINVOICE_PASSWORD: 'e2e-pass',
      VIETTEL_SINVOICE_AUTH_MODE: 'TOKEN',
      VIETTEL_SINVOICE_TIMEOUT: '3000',
      VIETTEL_SINVOICE_FILE_STORAGE_PATH: storageDir,
      VIETINBANK_ACCOUNT: '1ICS',
    });
    // Loaded only now so ConfigModule sees the mock's dynamic port.
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

    queues = Object.values(E_INVOICE_QUEUES).map((name) =>
      app.get<Queue>(getQueueToken(name)),
    );
    await Promise.all(queues.map((queue) => queue.drain(true)));
    invoices = app.get(getRepositoryToken(EInvoice));
    attempts = app.get(getRepositoryToken(EInvoiceAttempt));
    events = app.get(getRepositoryToken(EInvoiceEvent));
    files = app.get(getRepositoryToken(EInvoiceFile));
    receipts = app.get(getRepositoryToken(Receipt));

    einvoiceService = app.get(EInvoiceService);
    studentsService = app.get(StudentsService);
    studentClassesService = app.get(StudentClassesService);
    feePlansService = app.get(FeePlansService);
    feeAssignmentsService = app.get(FeeAssignmentsService);
    receivablesService = app.get(ReceivablesService);
    paymentOrdersService = app.get(PaymentOrdersService);
    paymentTransactionsService = app.get(PaymentTransactionsService);
    reconciliationService = app.get(ReconciliationService);
    cryptoKeyService = app.get(CryptoKeyService);
    viettinbankApiService = app.get(ViettinbankApiService);
    const schoolsService = app.get(SchoolsService);
    const usersService = app.get(UsersService);

    const newSchool = (suffix: string) =>
      schoolsService.create({
        code: `EI${suffix}${runId}`,
        name: `Trường HĐĐT ${suffix}`,
        bankCode: '970436',
        bankAccountNumber: '0123456789',
        bankAccountName: 'TRUONG HDDT TEST',
      });
    schoolA = await newSchool('A');
    schoolB = await newSchool('B');

    const password = 'Test@123456';
    const newUser = async (tag: string, role: Role, schoolId: string) => {
      const user = await usersService.create({
        email: `einvoice-${tag}-${runId}@test.local`,
        password,
        fullName: `E-invoice ${tag}`,
        role,
        schoolId,
      });
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: user.email, password })
        .expect(201);
      return {
        id: user.id,
        token: (login.body as { data: { accessToken: string } }).data
          .accessToken,
      };
    };
    const accountant = await newUser('acc', Role.ACCOUNTANT, schoolA.id);
    userId = accountant.id;
    accountantToken = accountant.token;
    viewerToken = (await newUser('viewer', Role.VIEWER, schoolA.id)).token;
    otherSchoolToken = (await newUser('other', Role.ACCOUNTANT, schoolB.id))
      .token;

    const academicYearsService = app.get(AcademicYearsService);
    academicYear = await academicYearsService.create({
      schoolId: schoolA.id,
      name: `EI-${runId}`,
      startDate: '2026-09-01',
      endDate: '2027-05-31',
      status: AcademicYearStatus.ACTIVE,
    });
    klass = await app.get(ClassesService).create({
      schoolId: schoolA.id,
      academicYearId: academicYear.id,
      code: `EIC${runId}`,
      name: `Lớp HĐĐT ${runId}`,
      grade: '1',
    });
    feeCategory = await app.get(FeeCategoriesService).create({
      schoolId: schoolA.id,
      name: 'Học phí',
    });

    await einvoiceService.upsertConfig(schoolA.id, baseConfig);
  });

  afterAll(async () => {
    await app?.close();
    await mock.stop();
    rmSync(storageDir, { recursive: true, force: true });
  });

  /** Polls until `check` returns a truthy value, promoting delayed BullMQ jobs so backoffs/delays don't slow the suite. */
  async function waitFor<T>(
    label: string,
    check: () => Promise<T | null | undefined | false>,
    timeoutMs = 30_000,
  ): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      for (const queue of queues) {
        for (const job of await queue.getDelayed()) {
          await job.promote().catch(() => undefined);
        }
      }
      const value = await check();
      if (value) return value;
      if (Date.now() > deadline) throw new Error(`Timed out waiting: ${label}`);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  async function settle(ms = 1_500): Promise<void> {
    const until = Date.now() + ms;
    await waitFor('settle', () => Promise.resolve(Date.now() > until));
  }

  async function waitForStatus(
    paymentId: string,
    status: EInvoiceStatus,
  ): Promise<EInvoice> {
    return waitFor(`invoice ${paymentId} -> ${status}`, async () => {
      const invoice = await invoices.findOneBy({ paymentId });
      return invoice?.status === status ? invoice : null;
    });
  }

  async function createStudentWithReceivable(
    amount = '720000',
    overrides: { parentPhone?: string; dateOfBirth?: string } = {},
  ): Promise<{ student: Student; receivableId: string }> {
    seq += 1;
    const schoolId = schoolA.id;
    const student = await studentsService.create({
      schoolId,
      fullName: `Học sinh HĐĐT ${runId}-${seq}`,
      identifierCode: `0790${runId}${seq}`.slice(0, 20),
      parentName: `Phụ huynh ${seq}`,
      parentPhone: '0901234567',
      parentEmail: `parent${seq}@example.com`,
      address: '1 Trần Hưng Đạo, Hà Nội',
      ...overrides,
    });
    await studentClassesService.assign({
      studentId: student.id,
      classId: klass.id,
      academicYearId: academicYear.id,
    });
    const feePlan = await feePlansService.create(
      {
        schoolId,
        feeCategoryId: feeCategory.id,
        unitPrice: amount,
        quantity: '1',
        status: FeePlanStatus.ACTIVE,
      },
      userId,
    );
    await feeAssignmentsService.assign(
      feePlan.id,
      { targetType: FeeAssignmentTargetType.STUDENT, studentIds: [student.id] },
      { userId },
    );
    const [receivable] = await receivablesService.findByStudent(student.id);
    return { student, receivableId: receivable.id };
  }

  async function payNewReceivable(amount = '720000') {
    const { student, receivableId } = await createStudentWithReceivable(amount);
    const order = await paymentOrdersService.create(
      { studentId: student.id, items: [{ receivableId }] },
      userId,
    );
    const externalId = `EI-${runId}-${++seq}`;
    const result = await paymentTransactionsService.ingest(
      'VIETQR',
      {
        id: externalId,
        gateway: 'VCB',
        transactionDate: new Date().toISOString(),
        accountNumber: schoolA.bankAccountNumber,
        content: order.orderCode,
        transferType: 'in',
        transferAmount: Number(amount),
      },
      {},
    );
    expect(result.matched).toBe(true);
    return { student, order, externalId, paymentId: result.transactionId! };
  }

  const api = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  describe('phát hành tự động sau thanh toán', () => {
    let paid: Awaited<ReturnType<typeof payNewReceivable>>;
    let invoice: EInvoice;

    it('webhook khớp → phát hành (invoiceNo rỗng) → đối soát 7.21 → tải PDF/ZIP → gửi email → COMPLETED', async () => {
      mock.issueMode = 'async';
      paid = await payNewReceivable();

      // The row is written inside the payment transaction, so it exists as soon as ingest returns.
      expect(
        await invoices.findOneBy({ paymentId: paid.paymentId }),
      ).not.toBeNull();

      invoice = await waitForStatus(paid.paymentId, EInvoiceStatus.COMPLETED);
      await waitFor('EMAIL_SENT event', () =>
        events.findOneBy({ invoiceId: invoice.id, eventType: 'EMAIL_SENT' }),
      );

      const [issueCall] = mock.issueCallsFor(invoice.transactionUuid);
      expect(issueCall.path).toBe(
        `${API_PREFIX}InvoiceAPI/InvoiceWS/createInvoice/${TAX_CODE}`,
      );
      expect(issueCall.headers.cookie).toBe('access_token=tok-1');
      const payload = issuePayload(issueCall);
      expect(payload.generalInvoiceInfo).toMatchObject({
        templateCode: '1/001',
        invoiceSeries: 'K26TAA',
        currencyCode: 'VND',
        adjustmentType: '1',
        paymentStatus: true,
        transactionUuid: invoice.transactionUuid,
      });
      expect(payload.buyerInfo).toMatchObject({
        buyerName: paid.student.fullName,
        buyerCode: paid.student.studentCode,
        buyerIdType: '1',
        buyerIdNo: paid.student.identifierCode,
        buyerAddressLine: '1 Trần Hưng Đạo, Hà Nội',
        buyerEmail: paid.student.parentEmail,
        buyerPhoneNumber: '0901234567',
      });
      expect(payload.payments).toEqual([
        { paymentMethod: '2', paymentMethodName: 'CK' },
      ]);
      expect(payload.itemInfo).toHaveLength(1);
      expect(payload.itemInfo[0]).toMatchObject({
        quantity: 1,
        unitPrice: 720000,
        itemTotalAmountWithoutTax: 720000,
        taxPercentage: -2,
        taxAmount: 0,
        itemTotalAmountWithTax: 720000,
      });
      expect(payload.summarizeInfo).toMatchObject({
        totalAmountWithoutTax: 720000,
        totalTaxAmount: 0,
        totalAmountWithTax: 720000,
      });
      expect(payload.taxBreakdowns).toEqual([
        expect.objectContaining({ taxPercentage: -2, taxableAmount: 720000 }),
      ]);

      const searchCalls = mock
        .callsTo('searchInvoiceByTransactionUuid')
        .filter((c) => c.form?.transactionUuid === invoice.transactionUuid);
      expect(searchCalls).toHaveLength(1);
      expect(searchCalls[0].headers['content-type']).toContain(
        'application/x-www-form-urlencoded',
      );
      expect(searchCalls[0].form?.supplierTaxCode).toBe(TAX_CODE);

      const stored = mock.invoices.get(invoice.transactionUuid)!;
      expect(invoice).toMatchObject({
        invoiceNo: stored.invoiceNo,
        transactionId: stored.transactionID,
        reconciliationAttempts: 1,
        errorCode: null,
      });
      expect(invoice.issuedAt).toBeInstanceOf(Date);

      const savedFiles = await files.find({ where: { invoiceId: invoice.id } });
      expect(savedFiles.map((f) => f.fileType).sort()).toEqual(['PDF', 'ZIP']);
      for (const file of savedFiles) {
        expect(existsSync(file.storagePath)).toBe(true);
      }
      const storedPdf = savedFiles.find((f) => f.fileType === 'PDF')!;
      expect(readFileSync(storedPdf.storagePath, 'utf8')).toBe(
        `FAKE-PDF-${stored.invoiceNo}`,
      );
      const storedZip = savedFiles.find((f) => f.fileType === 'ZIP')!;
      const archive = await JSZip.loadAsync(
        readFileSync(storedZip.storagePath),
      );
      expect(Object.keys(archive.files).sort()).toEqual([
        `${stored.invoiceNo}.pdf`,
        `${stored.invoiceNo}.xml`,
      ]);

      const emailCalls = mock
        .callsTo('sendEmailToCustomer')
        .filter((c) => c.json?.transactionUuid === invoice.transactionUuid);
      expect(emailCalls).toHaveLength(1);
      expect(emailCalls[0].json?.buyerEmail).toBe(paid.student.parentEmail);
      const emailEvent = await events.findOneByOrFail({
        invoiceId: invoice.id,
        eventType: 'EMAIL_SENT',
      });
      expect(emailEvent.payload).toEqual({ recipient: 'p***@example.com' });

      const log = await attempts.find({ where: { invoiceId: invoice.id } });
      expect(
        log.every((a) => a.status === EInvoiceAttemptStatus.SUCCEEDED),
      ).toBe(true);
      expect(log.map((a) => a.operation).sort()).toEqual(
        [
          EInvoiceAttemptOperation.DOWNLOAD,
          EInvoiceAttemptOperation.DOWNLOAD,
          EInvoiceAttemptOperation.ISSUE,
          EInvoiceAttemptOperation.RECONCILE,
          EInvoiceAttemptOperation.SEND_EMAIL,
        ].sort(),
      );
    });

    it('webhook gửi lặp (cùng mã giao dịch) không tạo thêm hóa đơn và không gọi lại Viettel', async () => {
      const again = await paymentTransactionsService.ingest(
        'VIETQR',
        {
          id: paid.externalId,
          gateway: 'VCB',
          transactionDate: new Date().toISOString(),
          accountNumber: schoolA.bankAccountNumber,
          content: paid.order.orderCode,
          transferType: 'in',
          transferAmount: 720000,
        },
        {},
      );
      expect(again.duplicate).toBe(true);
      await settle();
      expect(await invoices.countBy({ paymentId: paid.paymentId })).toBe(1);
      expect(mock.issueCallsFor(invoice.transactionUuid)).toHaveLength(1);
    });

    it('API: danh sách, chi tiết, tải PDF/ZIP/XML', async () => {
      const list = await api()
        .get('/einvoices')
        .query({ schoolId: schoolA.id, status: EInvoiceStatus.COMPLETED })
        .set(auth(accountantToken))
        .expect(200);
      const listBody = list.body as { data: { data: EInvoice[] } };
      const ids = listBody.data.data.map((i) => i.id);
      expect(ids).toContain(invoice.id);
      const row = listBody.data.data.find((i) => i.id === invoice.id)!;
      expect(row.student.fullName).toBe(paid.student.fullName);
      expect(row.receipt.receiptNumber).toEqual(expect.any(String));

      const byReceipt = await api()
        .get('/einvoices')
        .query({ receiptId: invoice.receiptId })
        .set(auth(viewerToken))
        .expect(200);
      expect(
        (byReceipt.body as { data: { data: EInvoice[] } }).data.data.map(
          (i) => i.id,
        ),
      ).toEqual([invoice.id]);
      const bySearch = await api()
        .get('/einvoices')
        .query({ search: invoice.invoiceNo })
        .set(auth(accountantToken))
        .expect(200);
      expect(
        (bySearch.body as { data: { data: EInvoice[] } }).data.data.map(
          (i) => i.id,
        ),
      ).toEqual([invoice.id]);

      const detail = await api()
        .get(`/einvoices/${invoice.id}`)
        .set(auth(viewerToken))
        .expect(200);
      const detailBody = (
        detail.body as {
          data: EInvoice & {
            files: Record<string, unknown>[];
            attempts: EInvoiceAttempt[];
          };
        }
      ).data;
      expect(detailBody.invoiceNo).toBe(invoice.invoiceNo);
      expect(detailBody.files.map((f) => f.fileType).sort()).toEqual([
        'PDF',
        'ZIP',
      ]);
      expect(detailBody.files[0]).not.toHaveProperty('storagePath');
      expect(detailBody.attempts.length).toBeGreaterThan(0);
      expect(detailBody.receipt.items).toHaveLength(1);

      const xml = await api()
        .get(`/einvoices/${invoice.id}/xml`)
        .set(auth(viewerToken))
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(xml.headers['content-type']).toBe('application/xml');
      expect(xml.headers['content-disposition']).toBe(
        `attachment; filename="${invoice.invoiceNo}.xml"`,
      );
      expect((xml.body as Buffer).toString()).toBe(
        `<HDon><SHDon>${invoice.invoiceNo}</SHDon></HDon>`,
      );

      const status = await api()
        .get('/einvoices/provider-status')
        .set(auth(viewerToken))
        .expect(200);
      expect((status.body as { data: unknown }).data).toEqual({
        provider: 'VIETTEL',
        enabled: true,
        autoIssue: true,
      });

      const pdf = await api()
        .get(`/einvoices/${invoice.id}/pdf`)
        .set(auth(accountantToken))
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      expect(pdf.headers['content-disposition']).toBe(
        `attachment; filename="${invoice.invoiceNo}.pdf"`,
      );
      expect((pdf.body as Buffer).toString()).toBe(
        `FAKE-PDF-${invoice.invoiceNo}`,
      );

      const zip = await api()
        .get(`/einvoices/${invoice.id}/zip`)
        .set(auth(accountantToken))
        .expect(200);
      expect(zip.headers['content-type']).toBe('application/zip');
    });

    it('API: phân quyền theo trường và vai trò', async () => {
      await api().get(`/einvoices/${invoice.id}`).expect(401);
      await api()
        .get(`/einvoices/${invoice.id}`)
        .set(auth(otherSchoolToken))
        .expect(403);
      await api()
        .get(`/einvoices/${invoice.id}/pdf`)
        .set(auth(otherSchoolToken))
        .expect(403);
      await api()
        .post(`/einvoices/${invoice.id}/retry`)
        .set(auth(viewerToken))
        .expect(403);
      await api()
        .put(`/einvoices/config/${schoolA.id}`)
        .set(auth(otherSchoolToken))
        .send(baseConfig)
        .expect(403);
    });

    it('API: hủy hóa đơn → gọi 7.9 dạng form và chuyển CANCELLED', async () => {
      await api()
        .post(`/einvoices/${invoice.id}/cancel`)
        .set(auth(accountantToken))
        .send({})
        .expect(400);

      await api()
        .post(`/einvoices/${invoice.id}/cancel`)
        .set(auth(accountantToken))
        .send({ reason: 'Thu nhầm học phí' })
        .expect(201);

      const [cancelCall] = mock.callsTo('cancelTransactionInvoice');
      expect(cancelCall.headers['content-type']).toContain(
        'application/x-www-form-urlencoded',
      );
      expect(cancelCall.form).toMatchObject({
        supplierTaxCode: TAX_CODE,
        invoiceNo: invoice.invoiceNo,
        templateCode: '1/001',
        reasonDelete: 'Thu nhầm học phí',
        additionalReferenceDesc: 'Thu nhầm học phí',
      });
      expect(cancelCall.form?.strIssueDate).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
      expect((await invoices.findOneByOrFail({ id: invoice.id })).status).toBe(
        EInvoiceStatus.CANCELLED,
      );
      expect(
        await events.countBy({
          invoiceId: invoice.id,
          eventType: 'INVOICE_CANCELLED',
        }),
      ).toBe(1);
    });

    it('hóa đơn đã hủy: tải lại PDF vẫn giữ CANCELLED, không gửi lại email; không hủy/gửi email lần nữa', async () => {
      await files.delete({ invoiceId: invoice.id, fileType: 'PDF' });
      await api()
        .get(`/einvoices/${invoice.id}/pdf`)
        .set(auth(accountantToken))
        .expect(404);
      await waitFor('PDF tải lại', () =>
        files.findOneBy({ invoiceId: invoice.id, fileType: 'PDF' }),
      );
      await settle(800);

      expect((await invoices.findOneByOrFail({ id: invoice.id })).status).toBe(
        EInvoiceStatus.CANCELLED,
      );
      expect(
        await events.countBy({
          invoiceId: invoice.id,
          eventType: 'EMAIL_SENT',
        }),
      ).toBe(1);
      await api()
        .post(`/einvoices/${invoice.id}/send-email`)
        .set(auth(accountantToken))
        .expect(400);
      await api()
        .post(`/einvoices/${invoice.id}/cancel`)
        .set(auth(accountantToken))
        .send({ reason: 'Hủy lần hai' })
        .expect(400);
    });
  });

  it('phát hành đồng bộ, thuế 8% giá đã gồm thuế: tách tiền trước thuế/thuế đúng', async () => {
    await einvoiceService.upsertConfig(schoolA.id, {
      ...baseConfig,
      taxPercentage: '8',
      pricesIncludeTax: true,
    });
    mock.issueMode = 'sync';
    try {
      const paid = await payNewReceivable('720000');
      const invoice = await waitForStatus(
        paid.paymentId,
        EInvoiceStatus.COMPLETED,
      );

      expect(
        mock
          .callsTo('searchInvoiceByTransactionUuid')
          .filter((c) => c.form?.transactionUuid === invoice.transactionUuid),
      ).toHaveLength(0);
      const payload = issuePayload(
        mock.issueCallsFor(invoice.transactionUuid)[0],
      );
      expect(payload.itemInfo[0]).toMatchObject({
        unitPrice: 666667,
        itemTotalAmountWithoutTax: 666667,
        taxPercentage: 8,
        taxAmount: 53333,
        itemTotalAmountWithTax: 720000,
      });
      expect(payload.summarizeInfo).toMatchObject({
        totalAmountWithoutTax: 666667,
        totalTaxAmount: 53333,
        totalAmountWithTax: 720000,
      });
    } finally {
      await einvoiceService.upsertConfig(schoolA.id, baseConfig);
      mock.issueMode = 'async';
    }
  });

  it('Viettel trả lỗi nghiệp vụ → FAILED, không tự retry; bấm retry → phát hành lại cùng transactionUuid', async () => {
    mock.nextIssueReplies.push({
      status: 200,
      body: {
        errorCode: 'TEMPLATE_NOT_FOUND',
        description: 'Mẫu hóa đơn không tồn tại',
      },
    });
    const paid = await payNewReceivable();
    const failed = await waitForStatus(paid.paymentId, EInvoiceStatus.FAILED);
    expect(failed.errorCode).toBe('TEMPLATE_NOT_FOUND');
    expect(failed.errorDescription).toBe('Mẫu hóa đơn không tồn tại');
    const [attempt] = await attempts.findBy({ invoiceId: failed.id });
    expect(attempt).toMatchObject({
      operation: EInvoiceAttemptOperation.ISSUE,
      status: EInvoiceAttemptStatus.FAILED,
      retryable: false,
    });

    await settle();
    expect(mock.issueCallsFor(failed.transactionUuid)).toHaveLength(1);

    await api()
      .post(`/einvoices/${failed.id}/cancel`)
      .set(auth(accountantToken))
      .send({ reason: 'Chưa phát hành' })
      .expect(400);

    await api()
      .post(`/einvoices/${failed.id}/retry`)
      .set(auth(accountantToken))
      .expect(201);
    const done = await waitForStatus(paid.paymentId, EInvoiceStatus.COMPLETED);
    expect(done.errorCode).toBeNull();
    expect(mock.issueCallsFor(failed.transactionUuid)).toHaveLength(2);
  });

  it('Viettel 5xx → BullMQ tự retry → COMPLETED', async () => {
    mock.nextIssueReplies.push({
      status: 503,
      body: { code: 503, message: 'Service Unavailable' },
    });
    const paid = await payNewReceivable();
    const invoice = await waitForStatus(
      paid.paymentId,
      EInvoiceStatus.COMPLETED,
    );
    const issueAttempts = await attempts.find({
      where: {
        invoiceId: invoice.id,
        operation: EInvoiceAttemptOperation.ISSUE,
      },
      order: { createdAt: 'ASC' },
    });
    expect(
      issueAttempts.map((a) => [a.status, a.httpStatus, a.retryable]),
    ).toEqual([
      [EInvoiceAttemptStatus.FAILED, 503, true],
      [EInvoiceAttemptStatus.SUCCEEDED, null, false],
    ]);
  });

  it('token Viettel hết hạn (401) → đăng nhập lại một lần rồi gọi tiếp', async () => {
    const loginsBefore = mock.logins;
    mock.rotateToken();
    const paid = await payNewReceivable();
    const invoice = await waitForStatus(
      paid.paymentId,
      EInvoiceStatus.COMPLETED,
    );
    expect(mock.logins).toBe(loginsBefore + 1);
    const calls = mock.issueCallsFor(invoice.transactionUuid);
    expect(calls.map((c) => c.headers.cookie)).toEqual([
      'access_token=tok-1',
      `access_token=${mock.token}`,
    ]);
    const issueAttempts = await attempts.findBy({
      invoiceId: invoice.id,
      operation: EInvoiceAttemptOperation.ISSUE,
    });
    expect(issueAttempts.map((a) => a.status)).toEqual([
      EInvoiceAttemptStatus.SUCCEEDED,
    ]);
  });

  async function newOrder() {
    const { student, receivableId } = await createStudentWithReceivable();
    const order = await paymentOrdersService.create(
      { studentId: student.id, items: [{ receivableId }] },
      userId,
    );
    return { student, order };
  }

  /** A bank transfer whose content matches no order, left for manual reconciliation. */
  async function ingestUnmatched(tag: string): Promise<string> {
    const ingest = await paymentTransactionsService.ingest(
      'VIETQR',
      {
        id: `EI-${tag}-${runId}`,
        gateway: 'VCB',
        transactionDate: new Date().toISOString(),
        accountNumber: schoolA.bankAccountNumber,
        content: 'chuyen khoan hoc phi',
        transferType: 'in',
        transferAmount: 720000,
      },
      {},
    );
    expect(ingest.matched).toBe(false);
    return ingest.transactionId!;
  }

  function waitForStudentInvoice(
    paymentId: string,
    studentId: string,
    status: EInvoiceStatus,
  ): Promise<EInvoice> {
    return waitFor(`invoice of student ${studentId} -> ${status}`, async () => {
      const invoice = await invoices.findOneBy({ paymentId, studentId });
      return invoice?.status === status ? invoice : null;
    });
  }

  it('đối soát thủ công (match giao dịch chưa khớp) cũng phát hành hóa đơn', async () => {
    const { order } = await newOrder();
    const paymentId = await ingestUnmatched('MANUAL');
    expect(await invoices.countBy({ paymentId })).toBe(0);

    await reconciliationService.match(paymentId, order.id, { userId });
    await waitForStatus(paymentId, EInvoiceStatus.COMPLETED);
  });

  it('không cho hủy khớp giao dịch đã xuất hóa đơn; hủy hóa đơn rồi hủy khớp → khớp lại sang học sinh khác xuất hóa đơn mới', async () => {
    const first = await newOrder();
    const paymentId = await ingestUnmatched('REMATCH');
    await reconciliationService.match(paymentId, first.order.id, { userId });
    const original = await waitForStatus(paymentId, EInvoiceStatus.COMPLETED);

    await expect(
      reconciliationService.unmatch(paymentId, 'Khớp nhầm học sinh', {
        userId,
      }),
    ).rejects.toThrow(original.invoiceNo!);

    await einvoiceService.cancel(original.id, 'Khớp nhầm học sinh');
    await reconciliationService.unmatch(paymentId, 'Khớp nhầm học sinh', {
      userId,
    });
    const second = await newOrder();
    await reconciliationService.match(paymentId, second.order.id, { userId });

    const reissued = await waitForStudentInvoice(
      paymentId,
      second.student.id,
      EInvoiceStatus.COMPLETED,
    );
    expect(reissued.id).not.toBe(original.id);
    expect(reissued.transactionUuid).not.toBe(original.transactionUuid);
    expect(reissued.receiptId).not.toBe(original.receiptId);
    expect((await invoices.findOneByOrFail({ id: original.id })).status).toBe(
      EInvoiceStatus.CANCELLED,
    );
  });

  it('hủy khớp khi hóa đơn chưa gửi được sang Viettel → tự hủy nội bộ (không gọi 7.9); khớp lại xuất hóa đơn mới', async () => {
    mock.nextIssueReplies.push({
      status: 200,
      body: { errorCode: 'TEMPLATE_NOT_FOUND', description: 'Sai mẫu' },
    });
    const first = await newOrder();
    const paymentId = await ingestUnmatched('VOID');
    await reconciliationService.match(paymentId, first.order.id, { userId });
    const failed = await waitForStatus(paymentId, EInvoiceStatus.FAILED);
    const cancelCalls = mock.callsTo('cancelTransactionInvoice').length;

    await reconciliationService.unmatch(paymentId, 'Khớp nhầm', { userId });
    expect((await invoices.findOneByOrFail({ id: failed.id })).status).toBe(
      EInvoiceStatus.CANCELLED,
    );
    expect(
      await events.countBy({
        invoiceId: failed.id,
        eventType: 'INVOICE_VOIDED',
      }),
    ).toBe(1);
    expect(mock.callsTo('cancelTransactionInvoice')).toHaveLength(cancelCalls);

    const second = await newOrder();
    await reconciliationService.match(paymentId, second.order.id, { userId });
    await waitForStudentInvoice(
      paymentId,
      second.student.id,
      EInvoiceStatus.COMPLETED,
    );
  });

  it('retry hóa đơn Viettel đã nhận nhưng hết lượt chờ số → tra 7.21, không gửi lại 7.2; trong lúc đó không cho hủy khớp', async () => {
    mock.searchNeverReady = true;
    try {
      const paid = await payNewReceivable();
      const stuck = await waitForStatus(paid.paymentId, EInvoiceStatus.FAILED);
      expect(stuck).toMatchObject({
        errorCode: 'INVOICE_NOT_READY',
        reconciliationAttempts: 5,
      });
      expect(stuck.transactionId).toBeTruthy();

      await expect(
        reconciliationService.unmatch(paid.paymentId, 'Khớp nhầm', { userId }),
      ).rejects.toThrow('chưa có số');

      mock.searchNeverReady = false;
      await api()
        .post(`/einvoices/${stuck.id}/retry`)
        .set(auth(accountantToken))
        .expect(201);
      const done = await waitForStatus(
        paid.paymentId,
        EInvoiceStatus.COMPLETED,
      );
      expect(done.invoiceNo).toBe(
        mock.invoices.get(stuck.transactionUuid)!.invoiceNo,
      );
      expect(mock.issueCallsFor(stuck.transactionUuid)).toHaveLength(1);
      expect(
        await events.countBy({
          invoiceId: stuck.id,
          eventType: 'ISSUE_RECOVERED_FROM_PROVIDER',
        }),
      ).toBe(1);
    } finally {
      mock.searchNeverReady = false;
    }
  });

  it('timeout khi phát hành (Viettel vẫn tạo hóa đơn) → lần thử lại tra 7.21, không gửi lại 7.2', async () => {
    mock.nextIssueReplies.push({ status: 200, body: {}, delayMs: 4_000 });
    const paid = await payNewReceivable();
    const done = await waitForStatus(paid.paymentId, EInvoiceStatus.COMPLETED);

    expect(mock.issueCallsFor(done.transactionUuid)).toHaveLength(1);
    expect(done.invoiceNo).toBe(
      mock.invoices.get(done.transactionUuid)!.invoiceNo,
    );
    const issueAttempts = await attempts.find({
      where: { invoiceId: done.id, operation: EInvoiceAttemptOperation.ISSUE },
      order: { createdAt: 'ASC' },
    });
    expect(
      issueAttempts.map((a) => [a.status, a.errorCode, a.retryable]),
    ).toEqual([
      [EInvoiceAttemptStatus.FAILED, 'TIMEOUT', true],
      [EInvoiceAttemptStatus.SUCCEEDED, null, false],
    ]);
  });

  it('API: cấu hình thuế suất > 0 bắt buộc khai báo giá đã gồm thuế hay chưa', async () => {
    await api()
      .put(`/einvoices/config/${schoolA.id}`)
      .set(auth(accountantToken))
      .send({ ...baseConfig, taxPercentage: '8' })
      .expect(400);
    await api()
      .put(`/einvoices/config/${schoolA.id}`)
      .set(auth(accountantToken))
      .send(baseConfig)
      .expect(200);
  });

  it('trường tắt hóa đơn điện tử → không tạo hóa đơn, thanh toán vẫn khớp', async () => {
    await einvoiceService.upsertConfig(schoolA.id, {
      ...baseConfig,
      enabled: false,
    });
    try {
      const paid = await payNewReceivable();
      await settle(500);
      expect(await invoices.countBy({ paymentId: paid.paymentId })).toBe(0);
    } finally {
      await einvoiceService.upsertConfig(schoolA.id, baseConfig);
    }
  });

  it('trường tắt tự động phát hành → không tự xuất; bấm "Xuất hóa đơn" theo phiếu thu → COMPLETED, không xuất trùng', async () => {
    await einvoiceService.upsertConfig(schoolA.id, {
      ...baseConfig,
      autoIssue: false,
    });
    try {
      mock.issueMode = 'sync';
      const paid = await payNewReceivable();
      await settle(500);
      expect(await invoices.countBy({ paymentId: paid.paymentId })).toBe(0);
      const receipt = await receipts.findOneByOrFail({
        paymentTransactionId: paid.paymentId,
      });
      const issue = () => api().post(`/einvoices/receipts/${receipt.id}/issue`);

      await issue().set(auth(viewerToken)).expect(403);
      await issue().set(auth(otherSchoolToken)).expect(403);
      const created = await issue().set(auth(accountantToken)).expect(201);
      expect((created.body as { data: EInvoice }).data.receiptId).toBe(
        receipt.id,
      );

      const done = await waitForStatus(
        paid.paymentId,
        EInvoiceStatus.COMPLETED,
      );
      expect(mock.issueCallsFor(done.transactionUuid)).toHaveLength(1);
      const prepared = await events.findOneByOrFail({
        invoiceId: done.id,
        eventType: 'INVOICE_PREPARED',
      });
      expect(prepared.payload).toMatchObject({ manual: true });

      await issue().set(auth(accountantToken)).expect(400);
      expect(await invoices.countBy({ paymentId: paid.paymentId })).toBe(1);
    } finally {
      await einvoiceService.upsertConfig(schoolA.id, baseConfig);
    }
  });

  describe('chế độ nháp: thanh toán tạo nháp trên cổng Viettel (7.8)', () => {
    beforeAll(async () => {
      await einvoiceService.upsertConfig(schoolA.id, {
        ...baseConfig,
        issueMode: EInvoiceIssueMode.DRAFT,
      });
    });

    afterAll(async () => {
      await einvoiceService.upsertConfig(schoolA.id, baseConfig);
    });

    /** Waits for the one reconcile attempt a sync makes to finish. */
    async function syncOnce(invoiceId: string): Promise<void> {
      const before = await attempts.countBy({
        invoiceId,
        operation: EInvoiceAttemptOperation.RECONCILE,
        status: EInvoiceAttemptStatus.SUCCEEDED,
      });
      await api()
        .post(`/einvoices/${invoiceId}/sync`)
        .set(auth(accountantToken))
        .expect(201);
      await waitFor('sync attempt', async () =>
        (await attempts.countBy({
          invoiceId,
          operation: EInvoiceAttemptOperation.RECONCILE,
          status: EInvoiceAttemptStatus.SUCCEEDED,
        })) > before
          ? true
          : null,
      );
    }

    it('QR động VietinBank → lưu giao dịch, tạo phiếu thu, gạch nợ và tạo đúng một nháp Viettel', async () => {
      const qrPayload =
        '00020101021238570010A00000072701270006970415011312345678901230208QRIBFTTA';
      const generateQr = jest
        .spyOn(viettinbankApiService, 'generateQr')
        .mockResolvedValue({
          requestId: `QR-${runId}-${seq}`,
          providerId: '9752',
          merchantId: '9752',
          clientDt: new Date().toISOString(),
          status: { statusCode: '00' },
          signature: 'bank-signature',
          data: { base64QRCode: Buffer.from(qrPayload).toString('base64') },
        });
      const verify = jest
        .spyOn(cryptoKeyService, 'verify')
        .mockReturnValue(true);

      try {
        const { student, receivableId } =
          await createStudentWithReceivable('720000');
        const order = await paymentOrdersService.create(
          {
            studentId: student.id,
            items: [{ receivableId }],
            paymentMethod: PaymentMethod.VIETINBANK,
          },
          userId,
        );

        expect(order.qrPayload).toBe(qrPayload);
        expect(generateQr).toHaveBeenCalledWith(
          expect.objectContaining({
            accountNumber: `1ICS${order.transferContent}`,
            amount: 720000,
            purposeOfTrans: order.transferContent,
          }),
        );

        const bankPayload = {
          msgId: `MSG-${runId}-${seq}`,
          providerId: '9752',
          transId: `VTB-${runId}-${seq}`,
          transTime: '20261015141530',
          transType: '3',
          custCode: `1ICS${order.transferContent}`,
          recvAcctId: '1ICS',
          amount: '720000',
          bankTransId: `BANK-${runId}-${seq}`,
          remark: `Thanh toan ${order.transferContent}`,
          currencyCode: 'VND',
          signature: 'valid-signature',
        };
        const paid = await paymentTransactionsService.ingest(
          PaymentProviderCode.VIETINBANK,
          bankPayload,
          {},
        );

        expect(paid).toMatchObject({
          duplicate: false,
          matched: true,
        });
        expect(verify).toHaveBeenCalled();
        expect(
          (await paymentTransactionsService.findById(paid.transactionId!))
            .status,
        ).toBe(PaymentTransactionStatus.ALLOCATED);
        expect((await receivablesService.findById(receivableId)).status).toBe(
          ReceivableStatus.PAID,
        );
        expect(
          await receipts.countBy({
            paymentTransactionId: paid.transactionId!,
          }),
        ).toBe(1);

        const draft = await waitForStatus(
          paid.transactionId!,
          EInvoiceStatus.DRAFT,
        );
        expect(mock.draftCallsFor(draft.transactionUuid)).toHaveLength(1);
        expect(mock.issueCallsFor(draft.transactionUuid)).toHaveLength(0);

        const retried = await paymentTransactionsService.ingest(
          PaymentProviderCode.VIETINBANK,
          bankPayload,
          {},
        );
        expect(retried).toMatchObject({ duplicate: true, matched: false });
        expect(
          await receipts.countBy({
            paymentTransactionId: paid.transactionId!,
          }),
        ).toBe(1);
        expect(await invoices.countBy({ paymentId: paid.transactionId! })).toBe(
          1,
        );
        expect(mock.draftCallsFor(draft.transactionUuid)).toHaveLength(1);
      } finally {
        verify.mockRestore();
        generateQr.mockRestore();
      }
    });

    it('thanh toán khớp → nháp 7.8 (không gọi 7.2) → chưa ký thì đồng bộ vẫn là nháp → ký trên cổng → đồng bộ lấy số, tải file, gửi email → COMPLETED', async () => {
      const paid = await payNewReceivable();
      const draft = await waitForStatus(paid.paymentId, EInvoiceStatus.DRAFT);
      const uuid = draft.transactionUuid;
      expect(draft.invoiceNo).toBeNull();
      expect(mock.issueCallsFor(uuid)).toHaveLength(0);
      const [draftCall] = mock.draftCallsFor(uuid);
      expect(mock.draftCallsFor(uuid)).toHaveLength(1);
      expect(draftCall.path).toBe(
        `${API_PREFIX}InvoiceAPI/InvoiceWS/createOrUpdateInvoiceDraft/${TAX_CODE}`,
      );
      expect(issuePayload(draftCall)).toMatchObject({
        generalInvoiceInfo: {
          templateCode: '1/001',
          invoiceSeries: 'K26TAA',
          transactionUuid: uuid,
        },
        buyerInfo: {
          buyerName: paid.student.fullName,
          buyerIdNo: paid.student.identifierCode,
          buyerAddressLine: paid.student.address,
        },
        summarizeInfo: { totalAmountWithTax: 720000 },
      });
      expect(
        await events.countBy({
          invoiceId: draft.id,
          eventType: 'DRAFT_CREATED',
        }),
      ).toBe(1);

      // Nháp chưa ký: 7.21 không thấy → giữ nháp, không đổi trạng thái lỗi.
      await syncOnce(draft.id);
      expect(await invoices.findOneByOrFail({ id: draft.id })).toMatchObject({
        status: EInvoiceStatus.DRAFT,
        invoiceNo: null,
        errorCode: null,
      });
      await settle(500);
      expect((await invoices.findOneByOrFail({ id: draft.id })).status).toBe(
        EInvoiceStatus.DRAFT,
      );

      mock.signDraft(uuid);
      await syncOnce(draft.id);
      const done = await waitForStatus(
        paid.paymentId,
        EInvoiceStatus.COMPLETED,
      );
      expect(done.invoiceNo).toMatch(/^K26TAA/);
      expect(await files.countBy({ invoiceId: done.id })).toBe(2);
      await waitFor('email', () =>
        Promise.resolve(
          mock
            .callsTo('sendEmailToCustomer')
            .some((call) => call.json?.transactionUuid === uuid),
        ),
      );
      expect(mock.draftCallsFor(uuid)).toHaveLength(1);
      expect(mock.issueCallsFor(uuid)).toHaveLength(0);
    });

    it('hủy khớp khi nháp chưa ký → tra 7.21 rồi hủy nội bộ (ghi chú phải xóa nháp trên cổng); khớp lại tạo nháp mới', async () => {
      const first = await newOrder();
      const paymentId = await ingestUnmatched('DRAFTVOID');
      await reconciliationService.match(paymentId, first.order.id, { userId });
      const draft = await waitForStatus(paymentId, EInvoiceStatus.DRAFT);
      const searches = mock.callsTo('searchInvoiceByTransactionUuid').length;

      await reconciliationService.unmatch(paymentId, 'Khớp nhầm', { userId });
      expect(mock.callsTo('searchInvoiceByTransactionUuid').length).toBe(
        searches + 1,
      );
      expect((await invoices.findOneByOrFail({ id: draft.id })).status).toBe(
        EInvoiceStatus.CANCELLED,
      );
      const voided = await events.findOneByOrFail({
        invoiceId: draft.id,
        eventType: 'DRAFT_VOIDED',
      });
      expect(voided.payload).toMatchObject({
        reason: 'Khớp nhầm',
        providerDraftLeft: true,
      });

      const second = await newOrder();
      await reconciliationService.match(paymentId, second.order.id, { userId });
      const redraft = await waitForStudentInvoice(
        paymentId,
        second.student.id,
        EInvoiceStatus.DRAFT,
      );
      expect(redraft.transactionUuid).not.toBe(draft.transactionUuid);
    });

    it('hủy khớp khi nháp đã được ký trên cổng → chặn và báo số hóa đơn', async () => {
      const first = await newOrder();
      const paymentId = await ingestUnmatched('DRAFTSIGNED');
      await reconciliationService.match(paymentId, first.order.id, { userId });
      const draft = await waitForStatus(paymentId, EInvoiceStatus.DRAFT);
      mock.signDraft(draft.transactionUuid);
      const signedNo = mock.invoices.get(draft.transactionUuid)!.invoiceNo;

      await expect(
        reconciliationService.unmatch(paymentId, 'Khớp nhầm', { userId }),
      ).rejects.toThrow(signedNo);
      expect((await invoices.findOneByOrFail({ id: draft.id })).status).toBe(
        EInvoiceStatus.DRAFT,
      );
    });
  });

  describe('Parent Portal: đăng ký nhận hóa đơn điện tử khi tạo đơn', () => {
    let orders: Repository<PaymentOrder>;
    const PASSWORD = '15082015';

    beforeAll(() => {
      orders = app.get(getRepositoryToken(PaymentOrder));
    });

    /** A student whose parent can log in (unique phone + birth date) and owes 720.000đ. */
    async function newParent() {
      const phone = `09${String(Date.now() + seq * 7919).slice(-8)}`;
      const { student, receivableId } = await createStudentWithReceivable(
        '720000',
        { parentPhone: phone, dateOfBirth: '2015-08-15' },
      );
      const login = await api()
        .post('/parent-auth/login')
        .send({ username: phone, password: PASSWORD })
        .expect(201);
      const token = (login.body as { data: { accessToken: string } }).data
        .accessToken;
      return { student, receivableId, token };
    }

    interface OrderBody {
      id: string;
      orderCode: string;
      status: string;
      requestedAmount: string;
      invoiceEmail: string | null;
      eInvoice?: Record<string, unknown>;
    }

    async function createOrder(
      parent: Awaited<ReturnType<typeof newParent>>,
      invoice?: unknown,
    ): Promise<OrderBody> {
      const res = await api()
        .post('/parent/payment-orders')
        .set(auth(parent.token))
        .send({
          items: [{ receivableId: parent.receivableId }],
          paymentMethod: 'VIETQR',
          ...(invoice === undefined ? {} : { invoice }),
        })
        .expect(201);
      return (res.body as { data: OrderBody }).data;
    }

    const getOrder = async (id: string, token: string) =>
      (
        (
          await api()
            .get(`/parent/payment-orders/${id}`)
            .set(auth(token))
            .expect(200)
        ).body as { data: OrderBody }
      ).data;

    const getQr = async (id: string, token: string) =>
      (
        (
          await api()
            .get(`/parent/payment-orders/${id}/qr`)
            .set(auth(token))
            .expect(200)
        ).body as {
          data: { status: string; eInvoice?: Record<string, unknown> };
        }
      ).data;

    /** Bank transfer quoting the order code, as the parent's banking app sends it. */
    const payOrder = (order: OrderBody) =>
      paymentTransactionsService.ingest(
        'VIETQR',
        {
          id: `EI-PARENT-${runId}-${++seq}`,
          gateway: 'VCB',
          transactionDate: new Date().toISOString(),
          accountNumber: schoolA.bankAccountNumber,
          content: order.orderCode,
          transferType: 'in',
          transferAmount: Number(order.requestedAmount),
        },
        {},
      );

    it('tạo đơn không yêu cầu hóa đơn: giữ nguyên hành vi, không có eInvoice ở cả 3 endpoint', async () => {
      const parent = await newParent();
      const order = await createOrder(parent);
      expect(order.status).toBe('PENDING');
      expect(order.invoiceEmail).toBeNull();
      expect(order).not.toHaveProperty('eInvoice');
      expect(await getOrder(order.id, parent.token)).not.toHaveProperty(
        'eInvoice',
      );
      expect(await getQr(order.id, parent.token)).not.toHaveProperty(
        'eInvoice',
      );
    });

    it('tạo đơn với email (có khoảng trắng, chữ hoa) → lưu email đã chuẩn hóa, eInvoice PENDING_PAYMENT, chưa gọi Viettel', async () => {
      const parent = await newParent();
      const issueCalls = mock.callsTo('/createInvoice/').length;
      const order = await createOrder(parent, {
        email: '  PhuHuynh.E2E@Example.COM ',
      });
      const pending = {
        status: 'PENDING_PAYMENT',
        buyerEmail: 'phuhuynh.e2e@example.com',
        invoiceNo: null,
        issuedAt: null,
        emailSentAt: null,
      };
      expect(order.eInvoice).toEqual(pending);
      expect(order.invoiceEmail).toBe('phuhuynh.e2e@example.com');
      expect((await getOrder(order.id, parent.token)).eInvoice).toEqual(
        pending,
      );
      const qr = await getQr(order.id, parent.token);
      expect(qr.status).toBe('PENDING');
      expect(qr.eInvoice).toEqual(pending);

      await settle(500);
      expect(await invoices.countBy({ paymentOrderId: order.id })).toBe(0);
      expect(mock.callsTo('/createInvoice/')).toHaveLength(issueCalls);
    });

    it.each([
      ['rỗng', { email: '' }, 'invoice.email là bắt buộc'],
      ['thiếu email', {}, 'invoice.email là bắt buộc'],
      [
        'sai định dạng',
        { email: 'phuhuynh@' },
        'invoice.email không đúng định dạng',
      ],
    ])('email %s → 400, không tạo đơn', async (_, invoice, message) => {
      const parent = await newParent();
      const res = await api()
        .post('/parent/payment-orders')
        .set(auth(parent.token))
        .send({ items: [{ receivableId: parent.receivableId }], invoice })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain(message);
      expect(await orders.countBy({ studentId: parent.student.id })).toBe(0);
    });

    it('thanh toán thành công → phát hành, gửi hóa đơn tới email đã đăng ký (không phải email hồ sơ) và trả số hóa đơn', async () => {
      const parent = await newParent();
      const order = await createOrder(parent, {
        email: 'DangKy.HoaDon@Example.com',
      });
      const paid = await payOrder(order);
      expect(paid.matched).toBe(true);

      const issued = await waitFor('invoice emailed', async () => {
        const invoice = await invoices.findOneBy({ paymentOrderId: order.id });
        return invoice?.status === EInvoiceStatus.COMPLETED &&
          invoice.emailSentAt
          ? invoice
          : null;
      });
      expect(issued.buyerEmail).toBe('dangky.hoadon@example.com');
      const [issueCall] = mock.issueCallsFor(issued.transactionUuid);
      expect(issuePayload(issueCall).buyerInfo.buyerEmail).toBe(
        'dangky.hoadon@example.com',
      );
      const emails = mock
        .callsTo('sendEmailToCustomer')
        .filter(
          (call) => call.json?.transactionUuid === issued.transactionUuid,
        );
      expect(emails).toHaveLength(1);
      expect(emails[0].json?.buyerEmail).toBe('dangky.hoadon@example.com');
      expect(parent.student.parentEmail).not.toBe('dangky.hoadon@example.com');

      const after = await getOrder(order.id, parent.token);
      expect(after.status).toBe('PAID');
      expect(after.eInvoice).toEqual({
        status: EInvoiceStatus.COMPLETED,
        buyerEmail: 'dangky.hoadon@example.com',
        invoiceNo: issued.invoiceNo,
        issuedAt: issued.issuedAt!.toISOString(),
        emailSentAt: issued.emailSentAt!.toISOString(),
      });
    });

    it.each(['EXPIRED', 'CANCELLED', 'FAILED'] as const)(
      'đơn %s → chuyển khoản tới không được khớp, không phát hành hóa đơn, eInvoice CANCELLED',
      async (status) => {
        const parent = await newParent();
        const order = await createOrder(parent, {
          email: 'phuhuynh@example.com',
        });
        if (status === 'EXPIRED') {
          await orders.update(order.id, {
            expiresAt: new Date(Date.now() - 1000),
          });
          const qr = await getQr(order.id, parent.token);
          expect(qr.status).toBe('EXPIRED');
          expect(qr.eInvoice).toMatchObject({ status: 'CANCELLED' });
        } else {
          await orders.update(order.id, { status: PaymentOrderStatus[status] });
        }
        const paid = await payOrder(order);
        expect(paid.matched).toBe(false);

        await settle(500);
        expect(await invoices.countBy({ paymentOrderId: order.id })).toBe(0);
        expect((await getOrder(order.id, parent.token)).eInvoice).toEqual({
          status: 'CANCELLED',
          buyerEmail: 'phuhuynh@example.com',
          invoiceNo: null,
          issuedAt: null,
          emailSentAt: null,
        });
      },
    );

    it('clientRequestId: gửi lại cùng khóa nhận lại đúng đơn cũ, khóa khác tạo đơn mới, khóa chỉ có hiệu lực theo từng học sinh', async () => {
      const parent = await newParent();
      const other = await newParent();
      const post = (who: typeof parent, clientRequestId: string) =>
        api()
          .post('/parent/payment-orders')
          .set(auth(who.token))
          .send({
            items: [{ receivableId: who.receivableId }],
            paymentMethod: 'VIETQR',
            invoice: { email: 'phuhuynh@example.com' },
            clientRequestId,
          })
          .expect(201)
          .then((res) => (res.body as { data: OrderBody }).data);

      const key = `req-${runId}-${seq}`;
      const [first, retry] = await Promise.all([
        post(parent, key),
        post(parent, key),
      ]);
      const again = await post(parent, key);
      expect(retry.id).toBe(first.id);
      expect(again.id).toBe(first.id);
      expect(again.eInvoice).toMatchObject({ status: 'PENDING_PAYMENT' });
      expect(await orders.countBy({ studentId: parent.student.id })).toBe(1);

      const second = await post(parent, `${key}-2`);
      expect(second.id).not.toBe(first.id);
      expect(await orders.countBy({ studentId: parent.student.id })).toBe(2);

      const otherOrder = await post(other, key);
      expect(otherOrder.id).not.toBe(first.id);
    });

    it('phụ huynh không đọc được đơn/hóa đơn, không dùng được khoản nợ của học sinh khác', async () => {
      const owner = await newParent();
      const other = await newParent();
      const order = await createOrder(owner, { email: 'chu.don@example.com' });

      for (const path of [
        `/parent/payment-orders/${order.id}`,
        `/parent/payment-orders/${order.id}/qr`,
      ]) {
        const res = await api().get(path).set(auth(other.token)).expect(403);
        expect(JSON.stringify(res.body)).not.toContain('chu.don@example.com');
        await api().get(path).expect(401);
      }

      await api()
        .post('/parent/payment-orders')
        .set(auth(other.token))
        .send({
          items: [{ receivableId: owner.receivableId }],
          invoice: { email: 'ke.gian@example.com' },
        })
        .expect(400);
      await api()
        .post('/parent/payment-orders')
        .set(auth(other.token))
        .send({
          studentId: owner.student.id,
          items: [{ receivableId: owner.receivableId }],
        })
        .expect(400);
      expect(await orders.countBy({ studentId: owner.student.id })).toBe(1);
    });
  });
});
