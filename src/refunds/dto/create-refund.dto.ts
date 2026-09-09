import { ApiProperty } from '@nestjs/swagger';
import { IsNumberString, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateRefundDto {
  @ApiProperty()
  @IsUUID()
  paymentTransactionId: string;

  @ApiProperty({ example: '80000' })
  @IsNumberString()
  amount: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  reason: string;
}
