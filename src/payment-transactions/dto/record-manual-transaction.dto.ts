import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsNumberString,
  IsOptional,
  IsString,
} from 'class-validator';

export class RecordManualTransactionDto {
  @ApiProperty({
    description:
      'Unique id for this manual entry (e.g. cash receipt number or bank statement ref)',
  })
  @IsString()
  externalTransactionId: string;

  @ApiProperty({ example: '720000' })
  @IsNumberString()
  amount: string;

  @ApiProperty({
    description: 'Must equal the target PaymentOrder.orderCode to auto-match',
  })
  @IsString()
  transferContent: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  transactionTime?: string;
}
