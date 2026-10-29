/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { FeeCategoriesService } from './fee-categories.service';

describe('FeeCategoriesService', () => {
  const repo = {
    exists: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };
  const sequenceService = { generateCode: jest.fn() };
  const service = new FeeCategoriesService(
    repo as never,
    sequenceService as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('tự sinh mã kỹ thuật KT, không phụ thuộc tên do client gửi', async () => {
    sequenceService.generateCode.mockResolvedValue('KT000001');
    repo.exists.mockResolvedValue(false);

    const result = await service.create({
      schoolId: '11111111-1111-4111-8111-111111111111',
      name: 'Học phí chính khóa',
    });

    expect(sequenceService.generateCode).toHaveBeenCalledWith(
      'KT',
      'FEE_CATEGORY',
      6,
    );
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'KT000001', name: 'Học phí chính khóa' }),
    );
    expect(result.code).toBe('KT000001');
  });

  it('bỏ qua mã cũ trùng và lấy số kế tiếp', async () => {
    sequenceService.generateCode
      .mockResolvedValueOnce('KT000001')
      .mockResolvedValueOnce('KT000002');
    repo.exists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const result = await service.create({
      schoolId: '11111111-1111-4111-8111-111111111111',
      name: 'Tiền ăn',
    });

    expect(result.code).toBe('KT000002');
  });
});
