import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { AppException } from '../exceptions/app.exception';
import { ErrorCode } from '../constants/error-codes';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ErrorCode.INTERNAL_ERROR;
    let message = 'Đã xảy ra lỗi hệ thống';
    let details: unknown;

    if (exception instanceof AppException) {
      status = exception.getStatus();
      code = exception.errorCode;
      message = exception.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const anyBody = body as Record<string, unknown>;
        message = Array.isArray(anyBody.message)
          ? (anyBody.message as string[]).join('; ')
          : ((anyBody.message as string) ?? exception.message);
        if (Array.isArray(anyBody.message)) {
          details = anyBody.message;
        }
      }
      code = status === HttpStatus.BAD_REQUEST ? ErrorCode.VALIDATION_ERROR : ErrorCode.INTERNAL_ERROR;
      if (status === HttpStatus.NOT_FOUND) code = ErrorCode.NOT_FOUND;
      if (status === HttpStatus.UNAUTHORIZED) code = ErrorCode.UNAUTHORIZED;
      if (status === HttpStatus.FORBIDDEN) code = ErrorCode.FORBIDDEN;
    } else if (exception instanceof QueryFailedError) {
      status = HttpStatus.CONFLICT;
      code = ErrorCode.VALIDATION_ERROR;
      message = 'Dữ liệu vi phạm ràng buộc cơ sở dữ liệu';
      this.logger.error(exception.message, exception.stack);
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    response.status(status).json({
      success: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
