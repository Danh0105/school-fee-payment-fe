/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import Decimal from 'decimal.js';
import { FeeAssignmentsService } from './fee-assignments.service';
import {
  BillingType,
  FeeAssignmentTargetType,
  FeePlanStatus,
} from '../common/enums/status.enum';

describe('FeeAssignmentsService', () => {
  it('mọi kế hoạch đều tạo HK1/HK2 và dồn phần tiền lẻ vào HK2', async () => {
    const assignmentRepo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const manager = { getRepository: jest.fn(() => assignmentRepo) };
    const dataSource = {
      transaction: jest.fn(async (callback) => callback(manager)),
    };
    const feePlansService = {
      findById: jest.fn().mockResolvedValue({
        id: 'plan-1',
        schoolId: 'school-1',
        academicYearId: 'year-1',
        semesterId: null,
        billingType: BillingType.ONE_TIME,
        status: FeePlanStatus.ACTIVE,
        unitPrice: new Decimal('9000001'),
        quantity: new Decimal(1),
        defaultAmount: new Decimal('9000001'),
        feeCategory: { id: 'category-1', name: 'Học phí chính khóa' },
      }),
    };
    const studentClassesService = {
      findStudentIdsByTarget: jest.fn().mockResolvedValue(['student-1']),
    };
    const receivablesService = {
      createIfNotExists: jest.fn(async (input) => ({ id: input.semesterId })),
    };
    const semestersService = {
      findPairByAcademicYear: jest.fn().mockResolvedValue([
        { id: 'hk1', name: 'Học kỳ 1', endDate: '2026-12-31' },
        { id: 'hk2', name: 'Học kỳ 2', endDate: '2027-05-31' },
      ]),
    };
    const auditLogsService = { record: jest.fn() };
    const service = new FeeAssignmentsService(
      {} as never,
      dataSource as never,
      feePlansService as never,
      studentClassesService as never,
      receivablesService as never,
      semestersService as never,
      auditLogsService as never,
    );

    const result = await service.assign(
      'plan-1',
      {
        targetType: FeeAssignmentTargetType.STUDENT,
        studentIds: ['student-1'],
      },
      { userId: 'user-1' },
    );

    expect(result.receivablesCreated).toBe(2);
    expect(receivablesService.createIfNotExists).toHaveBeenCalledTimes(2);
    const [first, second] = receivablesService.createIfNotExists.mock.calls.map(
      ([input]) => input,
    );
    expect(first).toMatchObject({
      semesterId: 'hk1',
      description: 'Học phí chính khóa - Học kỳ 1',
    });
    expect(first.unitPrice.toFixed(0)).toBe('4500000');
    expect(second).toMatchObject({
      semesterId: 'hk2',
      description: 'Học phí chính khóa - Học kỳ 2',
    });
    expect(second.unitPrice.toFixed(0)).toBe('4500001');
    expect(first.unitPrice.plus(second.unitPrice).toFixed(0)).toBe('9000001');
  });
});
