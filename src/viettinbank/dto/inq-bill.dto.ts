import { Type } from 'class-transformer';
import { IsOptional, IsString, ValidateNested } from 'class-validator';

export class InqBillHeaderDto {
  @IsString()
  msgId: string;

  @IsString()
  msgType: string;

  @IsString()
  channelId: string;

  /** Mã app đầu bank VietinBank cung cấp (VPG), echoed back as-is in the response. */
  @IsOptional()
  @IsString()
  gatewayId?: string;

  @IsString()
  providerId: string;

  @IsString()
  merchantId: string;

  @IsString()
  productId: string;

  // Fields VietinBank's real inq-bill caller sends but the doc's request
  // table omits (only its response table lists timestamp) — ValidationPipe
  // runs with forbidNonWhitelisted:true, so any undeclared field 400s the
  // whole request. Declared here just to be accepted; unused otherwise.
  @IsOptional()
  @IsString()
  timestamp?: string;

  @IsOptional()
  @IsString()
  recordNum?: string;

  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsString()
  signature: string;
}

export class InqBillDataDto {
  @IsString()
  transId: string;

  // Present in VietinBank's real request (often empty string) though not
  // in the doc's data table — see header note above on why this must be
  // declared even though our logic doesn't use it.
  @IsOptional()
  @IsString()
  channelId?: string;

  @IsString()
  transTime: string;

  @IsString()
  custCode: string;
}

export class InqBillRequestDto {
  @ValidateNested()
  @Type(() => InqBillHeaderDto)
  header: InqBillHeaderDto;

  @ValidateNested()
  @Type(() => InqBillDataDto)
  data: InqBillDataDto;
}

export interface InqBillResponse {
  header: {
    msgId: string;
    msgType: string;
    channelId: string;
    gatewayId?: string;
    providerId: string;
    merchantId: string;
    productId: string;
    timestamp: string;
    signature: string;
  };
  data: {
    errors: { errorCode: string; errorDesc: string };
    details: {
      transId: string;
      transTime: string;
      custCode: string;
      custName: string;
      billId: string | null;
      amount: string;
      amountMin: string | null;
      preseve1: string | null;
      preseve2: string | null;
      preseve3: string | null;
    };
  };
}
