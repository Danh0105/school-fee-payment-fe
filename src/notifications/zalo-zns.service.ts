import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ZaloTokenService } from './zalo-token.service';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';

const ZNS_SEND_URL = 'https://business.openapi.zalo.me/message/template';

interface ZnsSendResponse {
  error: number;
  message: string;
  data?: { msg_id?: string; sent_time?: string };
}

export interface SendZnsResult {
  success: boolean;
  providerMessageId?: string;
  errorMessage?: string;
}

/**
 * Thin wrapper around Zalo's ZNS "send by template" API. The template
 * itself (its parameter names) is whatever was approved on the Zalo OA
 * dashboard — this service just forwards templateData verbatim, so the
 * caller is responsible for matching the approved template's fields.
 */
@Injectable()
export class ZaloZnsService {
  private readonly logger = new Logger(ZaloZnsService.name);

  constructor(
    private readonly tokenService: ZaloTokenService,
    private readonly config: ConfigService,
  ) {}

  async sendTemplate(
    phone: string,
    templateData: Record<string, string>,
    templateId?: string,
  ): Promise<SendZnsResult> {
    const resolvedTemplateId =
      templateId ?? this.config.get<string>('zalo.znsTemplateId');
    if (!resolvedTemplateId) {
      throw AppException.badRequest(
        ErrorCode.ZALO_NOT_CONFIGURED,
        'Chưa cấu hình ZALO_ZNS_TEMPLATE_ID',
      );
    }

    let accessToken: string;
    try {
      accessToken = await this.tokenService.getValidAccessToken();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      return { success: false, errorMessage: message };
    }

    try {
      const response = await fetch(ZNS_SEND_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          access_token: accessToken,
        },
        body: JSON.stringify({
          phone,
          template_id: resolvedTemplateId,
          template_data: templateData,
        }),
      });

      const data = (await response.json()) as ZnsSendResponse;
      if (!response.ok || data.error !== 0) {
        this.logger.warn(
          `Zalo ZNS send failed for ${phone}: ${JSON.stringify(data)}`,
        );
        return {
          success: false,
          errorMessage: data.message ?? `HTTP ${response.status}`,
        };
      }

      return { success: true, providerMessageId: data.data?.msg_id };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.error(`Zalo ZNS request threw for ${phone}: ${message}`);
      return { success: false, errorMessage: message };
    }
  }
}
