import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CancelReceiptDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  reason: string;
}
