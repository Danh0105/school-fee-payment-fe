import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { getViettelSinvoiceConfig } from './viettel-sinvoice.config';
import { ViettelSinvoiceTokenStore } from './viettel-sinvoice-token.store';
import { ViettelSinvoiceException } from './exceptions/viettel-sinvoice.exception';

/** Log in again this long before Viettel's own expiry. */
const EXPIRY_MARGIN_MS = 60_000;

/** How long the token lives, from expires_in or else the JWT's exp - iat. */
function tokenLifetimeMs(expiresIn: unknown, token: string): number | null {
  const seconds = Number(expiresIn);
  if (expiresIn != null && Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1000;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString(),
    ) as { exp?: unknown; iat?: unknown };
    if (typeof payload.exp === 'number' && typeof payload.iat === 'number') {
      const lifetime = (payload.exp - payload.iat) * 1000;
      return lifetime > 0 ? lifetime : null;
    }
  } catch {
    // Not a JWT: no lifetime to read.
  }
  return null;
}

@Injectable()
export class ViettelSinvoiceAuthService {
  private loginInFlight: Promise<string> | null = null;

  constructor(
    private readonly http: HttpService,
    private readonly configService: ConfigService,
    private readonly tokens: ViettelSinvoiceTokenStore,
  ) {}

  async getHeaders(forceRefresh = false): Promise<Record<string, string>> {
    const config = getViettelSinvoiceConfig(this.configService);
    if (config.authMode === 'BASIC') {
      const value = Buffer.from(
        `${config.username}:${config.password}`,
      ).toString('base64');
      return { Authorization: `Basic ${value}` };
    }

    if (forceRefresh) this.tokens.clear();
    const cached = this.tokens.get();
    const token = cached ?? (await this.login());
    return { Cookie: `access_token=${token}` };
  }

  invalidate(): void {
    this.tokens.clear();
  }

  private login(): Promise<string> {
    if (!this.loginInFlight) {
      this.loginInFlight = this.performLogin().finally(() => {
        this.loginInFlight = null;
      });
    }
    return this.loginInFlight;
  }

  private async performLogin(): Promise<string> {
    const config = getViettelSinvoiceConfig(this.configService);
    try {
      const response = await this.http.axiosRef.post<unknown>(
        config.authUrl || new URL('/auth/login', config.baseUrl).toString(),
        { username: config.username, password: config.password },
        {
          timeout: config.timeout,
          headers: { 'Content-Type': 'application/json' },
        },
      );
      const body = response.data as {
        access_token?: unknown;
        accessToken?: unknown;
        expires_in?: unknown;
        data?: {
          access_token?: unknown;
          accessToken?: unknown;
          expires_in?: unknown;
        };
      };
      const token =
        body.access_token ??
        body.accessToken ??
        body.data?.access_token ??
        body.data?.accessToken;
      if (typeof token !== 'string' || token.length === 0) {
        throw new Error('Login response does not contain access_token');
      }
      // The token used to be kept until restart, and Viettel answers an
      // expired one with 500 "GENERAL", which never cleared it.
      const lifetime = tokenLifetimeMs(
        body.expires_in ?? body.data?.expires_in,
        token,
      );
      this.tokens.set(
        token,
        lifetime == null
          ? null
          : Date.now() + Math.max(lifetime - EXPIRY_MARGIN_MS, lifetime / 2),
      );
      return token;
    } catch {
      throw new ViettelSinvoiceException(
        'AUTH_ERROR',
        null,
        null,
        'Không thể xác thực với Viettel S-Invoice',
        'auth/login',
        null,
        true,
      );
    }
  }
}
