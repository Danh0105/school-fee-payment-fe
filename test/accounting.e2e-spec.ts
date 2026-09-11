import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
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
import { DiscountsService } from '../src/discounts/discounts.service';
import { AdjustmentsService } from '../src/adjustments/adjustments.service';
import { PaymentOrdersService } from '../src/payment-orders/payment-orders.service';
import { PaymentTransactionsService } from '../src/payment-transactions/payment-transactions.service';
import { ReconciliationService } from '../src/reconciliation/reconciliation.service';
import { RefundsService } from '../src/refunds/refunds.service';
import { StudentCreditsService } from '../src/student-credits/student-credits.service';
import { School } from '../src/schools/entities/school.entity';
import { AcademicYear } from '../src/academic-years/entities/academic-year.entity';
import { Class } from '../src/classes/entities/class.entity';
import { FeeCategory } from '../src/fee-categories/entities/fee-category.entity';
import { Student } from '../src/students/entities/student.entity';
import { StudentReceivable } from '../src/receivables/entities/student-receivable.entity';
import { Role } from '../src/common/enums/role.enum';
import {
  AcademicYearStatus,
  AdjustmentType,
  DiscountType,
  FeeAssignmentTargetType,
  FeePlanStatus,
  PaymentTransactionStatus,
  ReceivableStatus,
} from '../src/common/enums/status.enum';

describe('Accounting engine (e2e) — spec §52 mandatory cases', () => {
  let app: INestApplication;

  let schoolsService: SchoolsService;
  let usersService: UsersService;
  let academicYearsService: AcademicYearsService;
  let classesService: ClassesService;
  let studentsService: StudentsService;
  let studentClassesService: StudentClassesService;
  let feeCategoriesService: FeeCategoriesService;
  let feePlansService: FeePlansService;
  let feeAssignmentsService: FeeAssignmentsService;
  let receivablesService: ReceivablesService;
  let discountsService: DiscountsService;
  let adjustmentsService: AdjustmentsService;
  let paymentOrdersService: PaymentOrdersService;
  let paymentTransactionsService: PaymentTransactionsService;
  let reconciliationService: ReconciliationService;
  let refundsService: RefundsService;
  let studentCreditsService: StudentCreditsService;

  let school: School;
  let academicYear: AcademicYear;
  let klass: Class;
  let feeCategory: FeeCategory;
  let userId: string;
  let studentSeq = 0;

  const runId = Date.now().toString(36);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    schoolsService = app.get(SchoolsService);
    usersService = app.get(UsersService);
    academicYearsService = app.get(AcademicYearsService);
    classesService = app.get(ClassesService);
    studentsService = app.get(StudentsService);
    studentClassesService = app.get(StudentClassesService);
    feeCategoriesService = app.get(FeeCategoriesService);
    feePlansService = app.get(FeePlansService);
    feeAssignmentsService = app.get(FeeAssignmentsService);
    receivablesService = app.get(ReceivablesService);
    discountsService = app.get(DiscountsService);
    adjustmentsService = app.get(AdjustmentsService);
    paymentOrdersService = app.get(PaymentOrdersService);
    paymentTransactionsService = app.get(PaymentTransactionsService);
    reconciliationService = app.get(ReconciliationService);
    refundsService = app.get(RefundsService);
    studentCreditsService = app.get(StudentCreditsService);

    school = await schoolsService.create({
      code: `E2E${runId}`,
      name: 'Trường E2E Test',
      bankCode: '970436',
      bankAccountNumber: '0123456789',
      bankAccountName: 'TRUONG E2E TEST',
    });

    const user = await usersService.create({
      email: `e2e-${runId}@test.local`,
      password: 'Test@123456',
      fullName: 'E2E Tester',
      role: Role.ACCOUNTANT,
      schoolId: school.id,
    });
    userId = user.id;

    academicYear = await academicYearsService.create({
      schoolId: school.id,
      name: `E2E-${runId}`,
      startDate: '2026-09-01',
      endDate: '2027-05-31',
      status: AcademicYearStatus.ACTIVE,
    });

    klass = await classesService.create({
      schoolId: school.id,
      academicYearId: academicYear.id,
      code: `C${runId}`,
      name: `Class ${runId}`,
      grade: '1',
    });

    feeCategory = await feeCategoriesService.create({
      schoolId: school.id,
      code: `FC${runId}`,
      name: 'Học phí test',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const actor = () => ({ userId });

  async function createStudent(): Promise<Student> {
    studentSeq += 1;
    const student = await studentsService.create({
      schoolId: school.id,
      fullName: `Học sinh Test ${runId}-${studentSeq}`,
    });
    await studentClassesService.assign({
      studentId: student.id,
      classId: klass.id,
      academicYearId: academicYear.id,
    });
    return student;
  }

  /** Creates a fresh 720,000đ receivable (9 months x 80,000đ) for a new student, matching the spec's worked example. */
  async function createReceivable(
    amount = '720000',
  ): Promise<{ student: Student; receivable: StudentReceivable }> {
    const student = await createStudent();
    const feePlan = await feePlansService.create(
      {
        schoolId: school.id,
        feeCategoryId: feeCategory.id,
        unitPrice: amount,
        quantity: '1',
        status: FeePlanStatus.ACTIVE,
      },
      userId,
    );
    const result = await feeAssignmentsService.assign(
      feePlan.id,
      { targetType: FeeAssignmentTargetType.STUDENT, studentIds: [student.id] },
      { userId },
    );
    expect(result.receivablesCreated).toBe(1);
    const [receivable] = await receivablesService.findByStudent(student.id);
    return { student, receivable };
  }

  async function payViaWebhook(
    orderCode: string,
    amount: number,
    externalId: string,
  ) {
    return paymentTransactionsService.ingest(
      'VIETQR',
      {
        id: externalId,
        gateway: 'VCB',
        transactionDate: new Date().toISOString(),
        accountNumber: school.bankAccountNumber,
        content: orderCode,
        transferType: 'in',
        transferAmount: amount,
      },
      {},
    );
  }

  it('Case 1: full payment (720,000) settles the receivable -> PAID', async () => {
    const { student, receivable } = await createReceivable('720000');
    const order = await paymentOrdersService.create(
      { studentId: student.id, items: [{ receivableId: receivable.id }] },
      userId,
    );

    const result = await payViaWebhook(
      order.orderCode,
      720000,
      `CASE1-${runId}`,
    );
    expect(result.matched).toBe(true);

    const updated = await receivablesService.findById(receivable.id);
    expect(updated.amountPaid.toFixed(2)).toBe('720000.00');
    expect(updated.amountOutstanding.toFixed(2)).toBe('0.00');
    expect(updated.status).toBe(ReceivableStatus.PAID);
  });

  it('Case 2: partial payment (300,000 of 720,000) -> PARTIALLY_PAID, outstanding 420,000', async () => {
    const { student, receivable } = await createReceivable('720000');
    const order = await paymentOrdersService.create(
      { studentId: student.id, items: [{ receivableId: receivable.id }] },
      userId,
    );

    await payViaWebhook(order.orderCode, 300000, `CASE2-${runId}`);

    const updated = await receivablesService.findById(receivable.id);
    expect(updated.amountPaid.toFixed(2)).toBe('300000.00');
    expect(updated.amountOutstanding.toFixed(2)).toBe('420000.00');
    expect(updated.status).toBe(ReceivableStatus.PARTIALLY_PAID);
  });

  it('Case 3: overpayment (800,000 of 720,000) -> allocated 720,000, credit 80,000, never lost', async () => {
    const { student, receivable } = await createReceivable('720000');
    const order = await paymentOrdersService.create(
      { studentId: student.id, items: [{ receivableId: receivable.id }] },
      userId,
    );

    await payViaWebhook(order.orderCode, 800000, `CASE3-${runId}`);

    const updated = await receivablesService.findById(receivable.id);
    expect(updated.amountPaid.toFixed(2)).toBe('720000.00');
    expect(updated.status).toBe(ReceivableStatus.PAID);

    const balance = await studentCreditsService.getAvailableBalance(student.id);
    expect(balance.toFixed(2)).toBe('80000.00');
  });

  it('Case 4: webhook delivered twice with the same transaction id -> exactly one PaymentTransaction', async () => {
    const { student, receivable } = await createReceivable('720000');
    const order = await paymentOrdersService.create(
      { studentId: student.id, items: [{ receivableId: receivable.id }] },
      userId,
    );

    const externalId = `CASE4-${runId}`;
    const first = await payViaWebhook(order.orderCode, 720000, externalId);
    const second = await payViaWebhook(order.orderCode, 720000, externalId);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.transactionId).toBe(first.transactionId);

    const updated = await receivablesService.findById(receivable.id);
    expect(updated.amountPaid.toFixed(2)).toBe('720000.00'); // not double-applied
  });

  it('Case 5: 50,000đ fixed discount reduces amountDue from 720,000 to 670,000', async () => {
    const { receivable } = await createReceivable('720000');

    const discounted = await discountsService.create(
      receivable.id,
      {
        type: DiscountType.FIXED_AMOUNT,
        value: '50000',
        reason: 'Diện chính sách',
      },
      actor(),
    );
    expect(discounted.amount.toFixed(2)).toBe('50000.00');

    const updated = await receivablesService.findById(receivable.id);
    expect(updated.originalAmount.toFixed(2)).toBe('720000.00');
    expect(updated.discountAmount.toFixed(2)).toBe('50000.00');
    expect(updated.amountDue.toFixed(2)).toBe('670000.00');
  });

  it('Case 6: increase adjustment raises amountDue by the adjustment amount', async () => {
    const { receivable } = await createReceivable('720000');

    await adjustmentsService.create(
      receivable.id,
      {
        type: AdjustmentType.INCREASE,
        amount: '30000',
        reason: 'Phụ phí phát sinh',
      },
      actor(),
    );

    const updated = await receivablesService.findById(receivable.id);
    expect(updated.amountDue.toFixed(2)).toBe('750000.00');
    expect(updated.amountOutstanding.toFixed(2)).toBe('750000.00');
  });

  it('Case 7: refund draws down the student credit created by an overpayment', async () => {
    const { student, receivable } = await createReceivable('720000');
    const order = await paymentOrdersService.create(
      { studentId: student.id, items: [{ receivableId: receivable.id }] },
      userId,
    );
    const result = await payViaWebhook(
      order.orderCode,
      750000,
      `CASE7-${runId}`,
    );

    const refund = await refundsService.create(
      {
        paymentTransactionId: result.transactionId!,
        amount: '30000',
        reason: 'Phụ huynh yêu cầu hoàn tiền thừa',
      },
      { userId },
    );
    expect(refund.status).toBe('COMPLETED');

    const balance = await studentCreditsService.getAvailableBalance(student.id);
    expect(balance.toFixed(2)).toBe('0.00');
  });

  it('Case 8: reversal (unmatch) puts the receivable back to unpaid and cancels the receipt', async () => {
    const { student, receivable } = await createReceivable('720000');
    // Force an UNMATCHED transaction (content does not match any order), then manually match and unmatch it.
    const order = await paymentOrdersService.create(
      { studentId: student.id, items: [{ receivableId: receivable.id }] },
      userId,
    );
    const ingestResult = await payViaWebhook(
      `NOT-${order.orderCode}`,
      720000,
      `CASE8-${runId}`,
    );
    expect(ingestResult.matched).toBe(false);

    await reconciliationService.match(ingestResult.transactionId!, order.id, {
      userId,
    });
    let updated = await receivablesService.findById(receivable.id);
    expect(updated.status).toBe(ReceivableStatus.PAID);

    await reconciliationService.unmatch(
      ingestResult.transactionId!,
      'Đối soát sai, cần hủy khớp',
      { userId },
    );
    updated = await receivablesService.findById(receivable.id);
    expect(updated.amountPaid.toFixed(2)).toBe('0.00');
    expect(updated.status).toBe(ReceivableStatus.UNPAID);
  });

  it('Case 9: two concurrent webhooks with the same transaction id never double-pay', async () => {
    const { student, receivable } = await createReceivable('720000');
    const order = await paymentOrdersService.create(
      { studentId: student.id, items: [{ receivableId: receivable.id }] },
      userId,
    );

    const externalId = `CASE9-${runId}`;
    const [r1, r2] = await Promise.all([
      payViaWebhook(order.orderCode, 720000, externalId),
      payViaWebhook(order.orderCode, 720000, externalId),
    ]);

    const duplicates = [r1, r2].filter((r) => r.duplicate).length;
    expect(duplicates).toBe(1); // exactly one of the two calls detects the other as a duplicate

    const updated = await receivablesService.findById(receivable.id);
    expect(updated.amountPaid.toFixed(2)).toBe('720000.00');
    expect(updated.status).toBe(ReceivableStatus.PAID);
  });

  it('Case 10: one payment order allocates a single transaction across multiple receivables', async () => {
    const studentA = await createReceivable('720000');
    const studentB = await createReceivable('500000');
    // Force both receivables onto the same student so one order can cover both.
    const secondFeePlan = await feePlansService.create(
      {
        schoolId: school.id,
        feeCategoryId: feeCategory.id,
        unitPrice: '500000',
        quantity: '1',
        status: FeePlanStatus.ACTIVE,
      },
      userId,
    );
    await feeAssignmentsService.assign(
      secondFeePlan.id,
      {
        targetType: FeeAssignmentTargetType.STUDENT,
        studentIds: [studentA.student.id],
      },
      { userId },
    );
    const receivables = await receivablesService.findByStudent(
      studentA.student.id,
    );
    expect(receivables).toHaveLength(2);

    const order = await paymentOrdersService.create(
      {
        studentId: studentA.student.id,
        items: receivables.map((r) => ({ receivableId: r.id })),
      },
      userId,
    );
    expect(order.requestedAmount.toFixed(2)).toBe('1220000.00');

    await payViaWebhook(order.orderCode, 1220000, `CASE10-${runId}`);

    for (const r of receivables) {
      const updated = await receivablesService.findById(r.id);
      expect(updated.status).toBe(ReceivableStatus.PAID);
    }

    // studentB's own receivable must stay untouched — proves allocation never crosses students.
    const untouched = await receivablesService.findById(studentB.receivable.id);
    expect(untouched.status).toBe(ReceivableStatus.UNPAID);
  });

  it('sanity: PaymentTransaction ends ALLOCATED after a matched payment', async () => {
    const { student, receivable } = await createReceivable('100000');
    const order = await paymentOrdersService.create(
      { studentId: student.id, items: [{ receivableId: receivable.id }] },
      userId,
    );
    const result = await payViaWebhook(
      order.orderCode,
      100000,
      `SANITY-${runId}`,
    );
    const transaction = await paymentTransactionsService.findById(
      result.transactionId!,
    );
    expect(transaction.status).toBe(PaymentTransactionStatus.ALLOCATED);
  });
});
