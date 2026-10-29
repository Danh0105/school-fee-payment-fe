import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateFeeCategoryDto } from './create-fee-category.dto';

describe('CreateFeeCategoryDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const schoolId = '11111111-1111-4111-8111-111111111111';

  it('không yêu cầu code hoặc accountingCode từ client', async () => {
    const value = (await pipe.transform(
      { schoolId, name: 'Học phí chính khóa' },
      { type: 'body', metatype: CreateFeeCategoryDto },
    )) as CreateFeeCategoryDto;

    expect(value).toEqual({
      schoolId,
      name: 'Học phí chính khóa',
    });
  });

  it('từ chối code do client tự gửi', async () => {
    await expect(
      pipe.transform(
        { schoolId, code: 'TU-CHON', name: 'Học phí chính khóa' },
        { type: 'body', metatype: CreateFeeCategoryDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('từ chối accountingCode do client tự gửi', async () => {
    await expect(
      pipe.transform(
        { schoolId, name: 'Học phí chính khóa', accountingCode: '5111' },
        { type: 'body', metatype: CreateFeeCategoryDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
