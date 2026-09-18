import { IsOptional, IsString } from 'class-validator';

export class NotifyBillRequestDto {
  @IsString()
  msgId: string;

  @IsString()
  providerId: string;

  @IsString()
  transId: string;

  /** yyyyMMddHHmmss */
  @IsString()
  transTime: string;

  @IsString()
  transType: string;

  @IsOptional()
  @IsString()
  custCode?: string;

  @IsOptional()
  @IsString()
  sendAcctId?: string;

  @IsOptional()
  @IsString()
  sendAcctName?: string;

  @IsOptional()
  @IsString()
  recvAcctId?: string;

  @IsString()
  amount: string;

  @IsOptional()
  @IsString()
  bankTransId?: string;

  @IsString()
  remark: string;

  @IsString()
  currencyCode: string;

  @IsString()
  signature: string;
}

export interface NotifyBillResponse {
  transId: string;
  providerId: string;
  errorCode: string;
  errorDesc: string;
  signature: string;
}
