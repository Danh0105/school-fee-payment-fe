import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, ErrorMessages } from '../constants/error-codes';

export class AppException extends HttpException {
  public readonly errorCode: ErrorCode;

  constructor(
    errorCode: ErrorCode,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    message?: string,
  ) {
    super(message ?? ErrorMessages[errorCode], status);
    this.errorCode = errorCode;
  }

  static notFound(errorCode: ErrorCode, message?: string): AppException {
    return new AppException(errorCode, HttpStatus.NOT_FOUND, message);
  }

  static conflict(errorCode: ErrorCode, message?: string): AppException {
    return new AppException(errorCode, HttpStatus.CONFLICT, message);
  }

  static forbidden(
    errorCode: ErrorCode = ErrorCode.FORBIDDEN,
    message?: string,
  ): AppException {
    return new AppException(errorCode, HttpStatus.FORBIDDEN, message);
  }

  static unauthorized(
    errorCode: ErrorCode = ErrorCode.UNAUTHORIZED,
    message?: string,
  ): AppException {
    return new AppException(errorCode, HttpStatus.UNAUTHORIZED, message);
  }

  static badRequest(errorCode: ErrorCode, message?: string): AppException {
    return new AppException(errorCode, HttpStatus.BAD_REQUEST, message);
  }
}
