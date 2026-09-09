import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ZaloOAuthToken } from './entities/zalo-oauth-token.entity';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';

const ZALO_TOKEN_URL = 'https://oauth.zaloapp.com/v4/oa/access_token';
/** Refresh a little before the token's real expiry to avoid a race against an in-flight send. */
const REFRESH_SKEW_MS = 5 * 60_000;

interface ZaloTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: string;
  error?: number;
  error_name?: string;
  error_description?: string;
}

/**
 * Owns the Zalo OA OAuth token lifecycle. Zalo's v4 refresh flow issues a
 * NEW refresh_token on every use and invalidates the old one, so the pair
 * must be persisted every time — losing it means re-doing the OA's manual
 * OAuth authorization from scratch.
 */
@Injectable()
export class ZaloTokenService {
  private readonly logger = new Logger(ZaloTokenService.name);

  constructor(
    @InjectRepository(ZaloOAuthToken)
    private readonly repo: Repository<ZaloOAuthToken>,
    private readonly config: ConfigService,
  ) {}

  private get oaId(): string {
    return this.config.get<string>('zalo.oaId') || 'default';
  }

  async getValidAccessToken(): Promise<string> {
    let token = await this.repo.findOne({ where: { oaId: this.oaId } });

    if (!token) {
      token = await this.bootstrapFromInitialRefreshToken();
    }

    if (token.accessTokenExpiresAt.getTime() - REFRESH_SKEW_MS <= Date.now()) {
      token = await this.refresh(token.refreshToken);
    }

    return token.accessToken;
  }

  private async bootstrapFromInitialRefreshToken(): Promise<ZaloOAuthToken> {
    const initialRefreshToken = this.config.get<string>(
      'zalo.initialRefreshToken',
    );
    if (!initialRefreshToken) {
      throw AppException.badRequest(
        ErrorCode.ZALO_NOT_CONFIGURED,
        'Chưa cấu hình Zalo OA (thiếu ZALO_INITIAL_REFRESH_TOKEN cho lần đầu kết nối)',
      );
    }
    return this.refresh(initialRefreshToken);
  }

  private async refresh(refreshToken: string): Promise<ZaloOAuthToken> {
    const appId = this.config.get<string>('zalo.appId');
    const appSecret = this.config.get<string>('zalo.appSecret');
    if (!appId || !appSecret) {
      throw AppException.badRequest(
        ErrorCode.ZALO_NOT_CONFIGURED,
        'Chưa cấu hình ZALO_APP_ID / ZALO_APP_SECRET',
      );
    }

    const body = new URLSearchParams({
      refresh_token: refreshToken,
      app_id: appId,
      grant_type: 'refresh_token',
    });

    const response = await fetch(ZALO_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        secret_key: appSecret,
      },
      body: body.toString(),
    });

    const data = (await response.json()) as ZaloTokenResponse;
    if (!response.ok || !data.access_token || !data.refresh_token) {
      this.logger.error(`Zalo token refresh failed: ${JSON.stringify(data)}`);
      throw AppException.badRequest(
        ErrorCode.ZALO_NOT_CONFIGURED,
        `Làm mới token Zalo OA thất bại: ${data.error_description ?? 'unknown error'}`,
      );
    }

    const expiresInSeconds = Number(data.expires_in ?? '3600');
    const existing = await this.repo.findOne({ where: { oaId: this.oaId } });
    const entity = this.repo.create({
      id: existing?.id,
      oaId: this.oaId,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      accessTokenExpiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    });
    return this.repo.save(entity);
  }
}
