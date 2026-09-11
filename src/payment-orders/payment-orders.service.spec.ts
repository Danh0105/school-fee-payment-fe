import Decimal from 'decimal.js';
import { ConfigService } from '@nestjs/config';
import { DataSource, DeepPartial, EntityManager, Repository } from 'typeorm';
import {
  PaymentMethod,
  PaymentOrderStatus,
  ReceivableStatus,
} from '../common/enums/status.enum';
import { SequenceService } from '../database/sequence.service';
import { PaymentProvider } from '../payment-providers/payment-provider.interface';
import { PaymentProvidersService } from '../payment-providers/payment-providers.service';
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
