import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateParentPaymentOrderDto } from './create-parent-payment-order.dto';

describe('CreateParentPaymentOrderDto', () => {
  // Same options as the global pipe in main.ts.
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const items = [{ receivableId: '11111111-1111-4111-8111-111111111111' }];
  const validate = (body: Record<string, unknown>) =>
    pipe.transform(body, {
      type: 'body',
      metatype: CreateParentPaymentOrderDto,
    }) as Promise<CreateParentPaymentOrderDto>;
  const messagesOf = async (body: Record<string, unknown>) => {
    const error = await validate(body).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    return (
      (error as BadRequestException).getResponse() as { message: string[] }
    ).message;
  };

  it('không có invoice: hợp lệ như trước', async () => {
    const value = await validate({ items, paymentMethod: 'VIETQR' });
    expect(value.invoice).toBeUndefined();
    expect(value.items).toEqual(items);
  });

  it('chỉ cần email: không yêu cầu tên đơn vị, mã số thuế hay địa chỉ', async () => {
    const value = await validate({
      items,
      paymentMethod: 'VIETQR',
      invoice: { email: 'phuhuynh@example.com' },
    });
    expect(value.invoice).toEqual({ email: 'phuhuynh@example.com' });
  });

  it('email được bỏ khoảng trắng hai đầu và chuyển về chữ thường', async () => {
    const value = await validate({
      items,
      invoice: { email: '  PhuHuynh.Nguyen@Example.COM \t' },
    });
    expect(value.invoice?.email).toBe('phuhuynh.nguyen@example.com');
  });

  it.each([
    ['rỗng', ''],
    ['chỉ có khoảng trắng', '   '],
  ])('email %s → 400 "email là bắt buộc"', async (_, email) => {
    const messages = await messagesOf({ items, invoice: { email } });
    expect(messages).toContain('invoice.email là bắt buộc');
  });

  it.each(['phuhuynh', 'phuhuynh@', '@example.com', 'phu huynh@example.com'])(
    'email sai định dạng "%s" → 400',
    async (email) => {
      const messages = await messagesOf({ items, invoice: { email } });
      expect(messages).toEqual(['invoice.email không đúng định dạng']);
    },
  );

  it('có invoice nhưng thiếu email → 400', async () => {
    const messages = await messagesOf({ items, invoice: {} });
    expect(messages).toContain('invoice.email là bắt buộc');
  });

  it('invoice không phải object → 400', async () => {
    await expect(
      validate({ items, invoice: 'phuhuynh@example.com' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('không nhận studentId từ client', async () => {
    const messages = await messagesOf({
      items,
      studentId: '22222222-2222-4222-8222-222222222222',
    });
    expect(messages).toContain('property studentId should not exist');
  });
});
