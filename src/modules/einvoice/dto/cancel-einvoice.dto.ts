import { IsString, MaxLength } from 'class-validator';

export class CancelEInvoiceDto {
  @IsString()
  @MaxLength(500)
  reason: string;
}
