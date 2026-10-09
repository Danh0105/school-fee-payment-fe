import { ConfigService } from '@nestjs/config';
import { ViettelHttpMethod } from './viettel-sinvoice.constants';

export interface ViettelSinvoiceConfig {
  enabled: boolean;
  autoIssue: boolean;
  baseUrl: string;
  authUrl: string;
  webUrl: string;
  username: string;
  password: string;
  taxCode: string;
  templateCode: string;
  series: string;
  timeout: number;
  authMode: 'TOKEN' | 'BASIC';
  fileStoragePath: string;
  endpointMethods: Record<string, ViettelHttpMethod | undefined>;
}

export function getViettelSinvoiceConfig(
  config: ConfigService,
): ViettelSinvoiceConfig {
  return config.get<ViettelSinvoiceConfig>(
    'viettelSinvoice',
  ) as ViettelSinvoiceConfig;
}

export function normalizeViettelUrl(
  baseUrl: string,
  relativePath: string,
): string {
  const base = baseUrl.trim().replace(/\s+/g, '').replace(/\/+$/, '') + '/';
  let relative = relativePath.trim().replace(/\s+/g, '').replace(/^\/+/, '');
  if (/\/api\/$/i.test(base) && /^api\//i.test(relative)) {
    relative = relative.replace(/^api\//i, '');
  }
  return new URL(relative, base).toString();
}
