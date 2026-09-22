import Decimal from 'decimal.js';
import { ConfigService } from '@nestjs/config';
import { DataSource, DeepPartial, EntityManager, Repository } from 'typeorm';
import {
  PaymentMethod,
  PaymentOrderStatus,
  PaymentProviderCode,
  ReceivableStatus,
} from '../common/enums/status.enum';
import { SequenceService } from '../database/sequence.service';
import { PaymentProvider } from '../payment-providers/payment-provider.interface';
import { PaymentProvidersService } from '../payment-providers/payment-providers.service';
import { ViettinbankProvider } from '../payment-providers/providers/viettinbank.provider';
import { ReceivablesService } from '../receivables/receivables.service';
import { SchoolsService } from '../schools/schools.service';
import { StudentsService } from '../students/students.service';
import { PaymentOrder } from './entities/payment-order.entity';
import { PaymentOrderItem } from './entities/payment-order-item.entity';
import { PaymentOrdersService } from './payment-orders.service';

describe('PaymentOrdersService school bank compatibility', () => {
  it('still creates a VietQR payment order from legacy school bank fields', async () => {
    const createOrder = jest.fn(
      (input: DeepPartial<PaymentOrder>) => input as PaymentOrder,
    );
    const saveOrder = jest.fn((input: PaymentOrder) =>
      Promise.resolve({ id: 'order-id', ...input }),
    );
    const orderRepository = {
      create: createOrder,
      save: saveOrder,
    } as unknown as Repository<PaymentOrder>;
    const createItem = jest.fn(
      (input: DeepPartial<PaymentOrderItem>) => input as PaymentOrderItem,
    );
    const saveItems = jest.fn((input: PaymentOrderItem[]) =>
      Promise.resolve(input),
    );
    const itemRepository = {
      create: createItem,
      save: saveItems,
    } as unknown as Repository<PaymentOrderItem>;
    const getRepository = jest.fn(
      (entity: typeof PaymentOrder | typeof PaymentOrderItem) =>
        entity === PaymentOrder ? orderRepository : itemRepository,
    );
    const manager = { getRepository } as unknown as EntityManager;
    const transaction = jest.fn(
      (work: (entityManager: EntityManager) => Promise<PaymentOrder>) =>
        work(manager),
    );
    const dataSource = {
      transaction,
    } as unknown as DataSource;
    const receivablesService = {
      findById: jest.fn().mockResolvedValue({
        id: 'receivable-id',
        studentId: 'student-id',
        amountOutstanding: new Decimal('720000'),
        status: ReceivableStatus.UNPAID,
      }),
    } as unknown as ReceivablesService;
    const schoolsService = {
      findById: jest.fn().mockResolvedValue({
        id: 'school-id',
        name: 'Legacy School',
        bankName: 'Legacy Bank',
        bankCode: '970436',
        bankAccountNumber: '0123456789',
        bankAccountName: 'LEGACY SCHOOL',
        managerInfo: null,
        salesRepresentative: null,
      }),
    } as unknown as SchoolsService;
    const studentsService = {
      findById: jest.fn().mockResolvedValue({
        id: 'student-id',
        schoolId: 'school-id',
      }),
    } as unknown as StudentsService;
    const createQr: jest.MockedFunction<PaymentProvider['createQr']> = jest
      .fn()
      .mockReturnValue({
        qrPayload: 'vietqr-payload',
        qrUrl: 'https://example.test/vietqr.png',
      });
    const paymentProvidersService = {
      get: jest.fn().mockReturnValue({ createQr }),
    } as unknown as PaymentProvidersService;
    const sequenceService = {
      generateCode: jest.fn().mockResolvedValue('PAY260910000001'),
    } as unknown as SequenceService;
    const config = {
      get: jest.fn().mockReturnValue(60),
    } as unknown as ConfigService;
    const service = new PaymentOrdersService(
      {} as Repository<PaymentOrder>,
      dataSource,
      receivablesService,
      schoolsService,
      studentsService,
      paymentProvidersService,
      sequenceService,
      config,
    );

    const order = await service.create({
      studentId: 'student-id',
      paymentMethod: PaymentMethod.VIETQR,
      items: [{ receivableId: 'receivable-id' }],
    });

    expect(createQr).toHaveBeenCalledTimes(1);
    const qrInput = createQr.mock.calls[0][0];
    expect(qrInput).toMatchObject({
      bankCode: '970436',
      bankAccountNumber: '0123456789',
      bankAccountName: 'LEGACY SCHOOL',
    });
    expect(qrInput.amount).toBeInstanceOf(Decimal);
    expect(order).toMatchObject({
      status: PaymentOrderStatus.PENDING,
      bankCode: '970436',
      bankAccountNumber: '0123456789',
      qrPayload: 'vietqr-payload',
      qrUrl: 'https://example.test/vietqr.png',
    });
    expect(saveItems).toHaveBeenCalled();
  });
});

describe('PaymentOrdersService VietinBank virtual-account transferContent', () => {
  /**
   * VietinBank's accountNumber = VAC + VAV is capped at 19 chars (doc §2.1);
   * onboarding (VAC=1ICSPD0) confirmed VAV must be at most 12 chars. The
   * full orderCode ("PAY" + 6-digit date + 6-digit seq = 15 chars) doesn't
   * fit — this was the bug behind the wrong account number a tester
   * reported. VietinBank orders must use a separate, shorter
   * transferContent (order code minus the "PAY" prefix = 12 digits).
   */
  it('strips the "PAY" prefix so VietinBank VAV fits the 12-char limit', async () => {
    const createOrder = jest.fn(
      (input: DeepPartial<PaymentOrder>) => input as PaymentOrder,
    );
    const saveOrder = jest.fn((input: PaymentOrder) =>
      Promise.resolve({ id: 'order-id', ...input }),
    );
    const orderRepository = {
      create: createOrder,
      save: saveOrder,
    } as unknown as Repository<PaymentOrder>;
    const itemRepository = {
      create: jest.fn((input: DeepPartial<PaymentOrderItem>) => input as PaymentOrderItem),
      save: jest.fn((input: PaymentOrderItem[]) => Promise.resolve(input)),
    } as unknown as Repository<PaymentOrderItem>;
    const getRepository = jest.fn(
      (entity: typeof PaymentOrder | typeof PaymentOrderItem) =>
        entity === PaymentOrder ? orderRepository : itemRepository,
    );
    const manager = { getRepository } as unknown as EntityManager;
    const dataSource = {
      transaction: jest.fn(
        (work: (entityManager: EntityManager) => Promise<PaymentOrder>) =>
          work(manager),
      ),
    } as unknown as DataSource;
    const receivablesService = {
      findById: jest.fn().mockResolvedValue({
        id: 'receivable-id',
        studentId: 'student-id',
        amountOutstanding: new Decimal('720000'),
        status: ReceivableStatus.UNPAID,
      }),
    } as unknown as ReceivablesService;
    const schoolsService = {
      findById: jest.fn().mockResolvedValue({
        id: 'school-id',
        name: 'Ichi Skill School',
        bankCode: 'ICB',
        bankAccountNumber: null,
        bankAccountName: null,
        managerInfo: null,
        salesRepresentative: null,
      }),
    } as unknown as SchoolsService;
    const studentsService = {
      findById: jest.fn().mockResolvedValue({
        id: 'student-id',
        schoolId: 'school-id',
      }),
    } as unknown as StudentsService;
    const generateQr: jest.MockedFunction<ViettinbankProvider['generateQr']> =
      jest.fn().mockResolvedValue({
        qrPayload: 'emv-payload',
        qrUrl: 'https://img.vietqr.io/image/970415-1ICSPD0260922000001-compact2.png',
        raw: {},
      });
    const paymentProvidersService = {
      get: jest.fn((code: PaymentProviderCode) => {
        expect(code).toBe(PaymentProviderCode.VIETINBANK);
        return { generateQr } as unknown as ViettinbankProvider;
      }),
    } as unknown as PaymentProvidersService;
    const sequenceService = {
      generateCode: jest.fn().mockResolvedValue('PAY260922000001'),
    } as unknown as SequenceService;
    const config = {
      get: jest.fn().mockReturnValue(60),
    } as unknown as ConfigService;
    const service = new PaymentOrdersService(
      {} as Repository<PaymentOrder>,
      dataSource,
      receivablesService,
      schoolsService,
      studentsService,
      paymentProvidersService,
      sequenceService,
      config,
    );

    const order = await service.create({
      studentId: 'student-id',
      paymentMethod: PaymentMethod.VIETINBANK,
      items: [{ receivableId: 'receivable-id' }],
    });

    expect(generateQr).toHaveBeenCalledWith(
      expect.objectContaining({ transferContent: '260922000001' }),
    );
    const vav = generateQr.mock.calls[0][0].transferContent;
    expect(vav.length).toBeLessThanOrEqual(12);
    expect(order.orderCode).toBe('PAY260922000001');
    expect(order.transferContent).toBe('260922000001');
  });
});
