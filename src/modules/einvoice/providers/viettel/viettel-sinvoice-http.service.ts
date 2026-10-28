import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosRequestConfig } from 'axios';
import { randomUUID } from 'crypto';
import {
  getViettelSinvoiceConfig,
  normalizeViettelUrl,
} from './viettel-sinvoice.config';
import { ViettelEndpointDefinition } from './viettel-sinvoice.constants';
import { ViettelSinvoiceAuthService } from './viettel-sinvoice-auth.service';
import { ViettelSinvoiceException } from './exceptions/viettel-sinvoice.exception';

export interface ViettelRequestOptions {
  endpoint: ViettelEndpointDefinition;
  pathParams?: Record<string, string>;
  query?: object;
  data?: object;
  methodOverride?: AxiosRequestConfig['method'];
  transactionUuid?: string;
  invoiceId?: string;
  paymentId?: string;
}

/** An error body for the log: at most 1000 characters of it. */
function truncatedBody(body: unknown): string | null {
  if (body == null || body === '') return null;
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return text.length > 1000 ? `${text.slice(0, 1000)}…` : text;
}

@Injectable()
export class ViettelSinvoiceHttpService {
  private readonly logger = new Logger(ViettelSinvoiceHttpService.name);

  constructor(
    private readonly http: HttpService,
    private readonly auth: ViettelSinvoiceAuthService,
    private readonly configService: ConfigService,
  ) {}

  async request<T>(
    options: ViettelRequestOptions,
    authRetry = true,
  ): Promise<T> {
    const config = getViettelSinvoiceConfig(this.configService);
    let path = options.endpoint.path;
    for (const [key, value] of Object.entries(options.pathParams ?? {})) {
      path = path.replace(`{${key}}`, encodeURIComponent(value));
    }
    const url = normalizeViettelUrl(config.baseUrl, path);
    const requestId = randomUUID();
    const startedAt = Date.now();
    const method = options.methodOverride ?? options.endpoint.method;
    if (!method) {
      throw new ViettelSinvoiceException(
        'VALIDATION_ERROR',
        null,
        'VERIFY_VIETTEL_METHOD',
        `Chưa cấu hình HTTP method cho mục ${options.endpoint.section}`,
        path,
        options.transactionUuid ?? null,
        false,
      );
    }

    try {
      const authHeaders = await this.auth.getHeaders();
      const response = await this.http.axiosRef.request<T>({
        url,
        method,
        timeout: config.timeout,
        params: options.query,
        data:
          options.endpoint.contentType === 'application/x-www-form-urlencoded'
            ? this.toFormData(options.data)
            : options.data,
        headers: {
          Accept: 'application/json',
          'Content-Type': options.endpoint.contentType,
          ...authHeaders,
        },
      });
      this.logger.log(
        JSON.stringify({
          requestId,
          invoiceId: options.invoiceId,
          paymentId: options.paymentId,
          transactionUuid: options.transactionUuid,
          endpoint: path,
          duration: Date.now() - startedAt,
          httpStatus: response.status,
        }),
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError<unknown>;
      if (authRetry && [401, 403].includes(axiosError.response?.status ?? 0)) {
        this.auth.invalidate();
        return this.request<T>(options, false);
      }
      // Failed calls were not logged at all, and Viettel's bare "GENERAL"
      // says nothing: keep the start of the body to see the real reason.
      this.logger.warn(
        JSON.stringify({
          requestId,
          invoiceId: options.invoiceId,
          paymentId: options.paymentId,
          transactionUuid: options.transactionUuid,
          endpoint: path,
          duration: Date.now() - startedAt,
          httpStatus: axiosError.response?.status ?? null,
          code: axiosError.code ?? null,
          body: truncatedBody(axiosError.response?.data),
        }),
      );
      throw this.mapError(error, path, options.transactionUuid ?? null);
    }
  }

  private toFormData(data?: object): URLSearchParams {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(data ?? {})) {
      if (value == null) continue;
      if (Array.isArray(value)) {
        for (const item of value) params.append(key, String(item));
      } else {
        params.append(key, String(value));
      }
    }
    return params;
  }

  private mapError(
    error: unknown,
    endpoint: string,
    uuid: string | null,
  ): ViettelSinvoiceException {
    if (error instanceof ViettelSinvoiceException) return error;
    const axiosError = error as AxiosError<unknown>;
    const status = axiosError.response?.status ?? null;
    const body = (axiosError.response?.data ?? {}) as {
      errorCode?: unknown;
      description?: unknown;
      code?: unknown;
      message?: unknown;
      data?: unknown;
    };
    const code = body.errorCode ?? body.code;
    const summary = body.description ?? body.message;
    // InvoiceWS may give only a key in message ("GENERAL") and the reason
    // in data.
    const detail = typeof body.data === 'string' ? body.data.trim() : '';
    const message =
      typeof summary === 'string' && detail && detail !== summary
        ? `${summary}: ${detail}`
        : typeof summary === 'string'
          ? summary
          : detail || null;
    const isTimeout =
      axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT';
    const isNetwork = !axiosError.response && !isTimeout;
    const kind = isTimeout
      ? 'TIMEOUT'
      : isNetwork
        ? 'NETWORK_ERROR'
        : status && status >= 500
          ? 'VIETTEL_5XX'
          : status === 401 || status === 403
            ? 'AUTH_ERROR'
            : status === 400
              ? 'VALIDATION_ERROR'
              : 'UNKNOWN';
    const normalizedCode =
      typeof code === 'string'
        ? code
        : typeof code === 'number' || typeof code === 'boolean'
          ? code.toString()
          : null;
    return new ViettelSinvoiceException(
      kind,
      status,
      normalizedCode,
      message ?? 'Viettel S-Invoice request failed',
      endpoint,
      uuid,
      isTimeout || isNetwork || (status != null && status >= 500),
    );
  }
}
