/* eslint-disable @typescript-eslint/no-unsafe-return */
import Decimal from 'decimal.js';
import { ReceivablesService } from './receivables.service';

describe('ReceivablesService', () => {
  it('bỏ qua khi đã có cùng studentId + feePlanId + semesterId', async () => {
    const repo = {
      findOne: jest.fn().mockResolvedValue({ id: 'existing-receivable' }),
      create: jest.fn((value) => value),
      save: jest.fn(),
    };
    const manager = {
      query: jest.fn().mockResolvedValue([]),
      getRepository: jest.fn(() => repo),
    };
    const sequenceService = { generateCode: jest.fn() };
    const ledgerService = { post: jest.fn() };
    const service = new ReceivablesService(
      repo as never,
      {} as never,
      sequenceService as never,
      ledgerService as never,
    );

    const result = await service.createIfNotExists(
      {
        schoolId: 'school-1',
        studentId: 'student-1',
        academicYearId: 'year-1',
        semesterId: 'hk1',
        feePlanId: 'plan-1',
        quantity: new Decimal(1),
        unitPrice: new Decimal(4_500_000),
      },
      manager as never,
    );

    expect(result).toBeNull();
    expect(manager.query).toHaveBeenCalledTimes(1);
    expect(repo.findOne).toHaveBeenCalledWith({
      where: {
        studentId: 'student-1',
        feePlanId: 'plan-1',
        semesterId: 'hk1',
      },
    });
    expect(sequenceService.generateCode).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
    expect(ledgerService.post).not.toHaveBeenCalled();
  });
});
