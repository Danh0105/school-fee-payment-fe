import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { isAxiosError } from 'axios';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { CryptoKeyService } from './crypto-key.service';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';

export interface GenerateQrInput {
  /** Full virtual sub-account number: VietinBank account + custCode suffix. */
  accountNumber: string;
  amount: number;
  purposeOfTrans: string;
}

export interface GenerateQrResult {
  requestId: string;
  providerId: string;
  merchantId: string;
  clientDt: string;
  status: { statusCode: string; statusDesc?: string };
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Thin client for VietinBank's eBank Biz "generate QR" API: request signing,
 * the HTTP call, and response signature verification. Holds no domain
 * knowledge of orders/bills so it can be reused by any application that
 * needs to talk to VietinBank.
 */
@Injectable()
export class ViettinbankApiService {
  private readonly logger = new Logger(ViettinbankApiService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly cryptoKeys: CryptoKeyService,
  ) {}

  async generateQr(input: GenerateQrInput): Promise<GenerateQrResult> {
    const providerId = this.config.get<string>('viettinbank.providerId')!;
    const merchantId = this.config.get<string>('viettinbank.merchantId')!;
    const baseUrl = this.config.get<string>('viettinbank.baseUrl');
    const clientId = this.config.get<string>('viettinbank.clientId');
    const clientSecret = this.config.get<string>('viettinbank.clientSecret');
    const privateKeyPath = this.config.get<string>(
      'viettinbank.privateKeyPath',
    );
    const publicKeyPath = this.config.get<string>('viettinbank.publicKeyPath');
    if (!baseUrl || !clientId || !clientSecret || !privateKeyPath) {
      throw new Error('VietinBank is not configured');
    }

    const requestId = randomUUID();
    const clientDt = new Date().toISOString();
    const body = {
      requestId,
      providerId,
      merchantId,
      channel: 'WEB',
      version: '1.0.1',
      language: 'vi',
      clientDt,
      data: input,
      signature: '',
    };
    const signDataString =
      requestId + providerId + merchantId + clientDt + input.accountNumber;
    body.signature = this.signWithPrivateKey(signDataString, privateKeyPath);

    let res;
    try {
      res = await axios.post<GenerateQrResult>(baseUrl, body, {
        headers: {
          'Content-Type': 'application/json',
          'x-ibm-client-id': clientId,
          'x-ibm-client-secret': clientSecret,
        },
        timeout: 15000,
      });
    } catch (err) {
      if (isAxiosError(err)) {
        // Log the bank's actual response body — the doc's error table (§2.2.1:
        // 401 sai key, 403 lỗi ký số/chưa cấu hình đối tác) requires this
        // detail to diagnose; the generic AxiosError message alone doesn't
        // say which. Surface only a generic message to the client so a bank
        // outage doesn't leak internal wiring details.
        this.logger.error(
          `VietinBank generateQr call failed: HTTP ${err.response?.status} — ${JSON.stringify(err.response?.data)}`,
        );
      } else {
        this.logger.error('VietinBank generateQr call failed', err as Error);
      }
      throw AppException.badGateway(ErrorCode.VIETINBANK_QR_GENERATION_FAILED);
    }

    const responseData = res.data;
    const verifyData =
      responseData.requestId +
      responseData.providerId +
      responseData.merchantId +
      responseData.clientDt +
      responseData.status.statusCode;
    if (
      publicKeyPath &&
      !this.verifyWithPublicKey(
        verifyData,
        responseData.signature as unknown as string,
        publicKeyPath,
      )
    ) {
      this.logger.error('VietinBank generateQr response signature invalid');
      throw AppException.badGateway(ErrorCode.VIETINBANK_QR_GENERATION_FAILED);
    }

    return responseData;
  }

  private signWithPrivateKey(data: string, privateKeyPath: string): string {
    const privateKey = fs.readFileSync(path.resolve(privateKeyPath), 'utf8');
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(data);
    signer.end();
    return signer.sign(privateKey, 'base64');
  }

  private verifyWithPublicKey(
    data: string,
    signature: string,
    publicKeyPath: string,
  ): boolean {
    const publicKey = fs.readFileSync(path.resolve(publicKeyPath), 'utf8');
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(data);
    verifier.end();
    return verifier.verify(publicKey, signature, 'base64');
  }
}
