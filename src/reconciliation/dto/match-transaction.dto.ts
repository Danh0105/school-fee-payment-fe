import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class MatchTransactionDto {
  @ApiProperty()
  @IsUUID()
  paymentOrderId: string;
}
