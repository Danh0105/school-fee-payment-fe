import { Type } from 'class-transformer';
import { IsString, ValidateNested } from 'class-validator';

export class InqBillHeaderDto {
  @IsString()
  msgId: string;

  @IsString()
  msgType: string;

  @IsString()
  channelId: string;

  @IsString()
  providerId: string;

  @IsString()
  merchantId: string;

  @IsString()
  productId: string;

  @IsString()
  signature: string;
}

export class InqBillDataDto {
  @IsString()
  transId: string;

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
