import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpsertEInvoiceConfigDto {
  @IsBoolean() enabled: boolean;
  @IsOptional() @IsBoolean() autoIssue?: boolean;
  @IsString() @MaxLength(20) supplierTaxCode: string;
  @IsString() @MaxLength(20) templateCode: string;
  @IsString() @MaxLength(25) invoiceSeries: string;
  @IsOptional() @IsString() @Length(3, 3) currencyCode?: string;
  @IsIn(['-2', '-1', '0', '5', '8', '10']) taxPercentage: string;
  // Without it a taxed amount cannot be split into giá chưa thuế/thuế, and
  // every invoice of the school would fail at issue time.
  @ValidateIf(
    (dto: UpsertEInvoiceConfigDto) =>
      dto.pricesIncludeTax !== undefined || Number(dto.taxPercentage) > 0,
  )
  @IsBoolean({
    message: 'pricesIncludeTax là bắt buộc khi thuế suất lớn hơn 0',
  })
  pricesIncludeTax?: boolean;
  @IsOptional() @IsIn(['HSM', 'USB_TOKEN', 'CLOUD_CA']) signingMode?: string;
}
