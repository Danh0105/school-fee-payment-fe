import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { TransformInterceptor } from './transform.interceptor';
import { RAW_RESPONSE_KEY } from '../decorators/raw-response.decorator';

/**
 * VietinBank rejected our inq-bill/notify-bill responses for not matching
 * their documented envelope — root cause was this interceptor wrapping
 * EVERY controller's response (including bank-facing ones marked
 * @Public()) in the app's own { success, data } shape. @RawResponse()
 * exists specifically so partner-format endpoints can opt out.
 */
describe('TransformInterceptor', () => {
  function makeContext(metadata: boolean | undefined) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(metadata),
    } as unknown as Reflector;
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of({ header: {}, data: {} }) };
    return { reflector, context, next };
  }

  it('bọc response mặc định trong { success, data } khi không đánh dấu @RawResponse()', (done) => {
    const { reflector, context, next } = makeContext(undefined);
    const interceptor = new TransformInterceptor(reflector);

    interceptor.intercept(context, next).subscribe((result) => {
      expect(result).toEqual({ success: true, data: { header: {}, data: {} } });
      done();
    });
  });

  it('trả nguyên response gốc, KHÔNG bọc, khi route đánh dấu @RawResponse() (vd endpoint VietinBank)', (done) => {
    const { reflector, context, next } = makeContext(true);
    const interceptor = new TransformInterceptor(reflector);

    interceptor.intercept(context, next).subscribe((result) => {
      expect(result).toEqual({ header: {}, data: {} });
      expect(result).not.toHaveProperty('success');
      done();
    });

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      RAW_RESPONSE_KEY,
      [context.getHandler(), context.getClass()],
    );
  });
});
