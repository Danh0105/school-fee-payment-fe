import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class GeneralInvoiceInfoDto {
  @IsOptional() @IsString() invoiceType?: string;
  @IsString() @MaxLength(20) templateCode: string;
  @IsString() @MaxLength(25) invoiceSeries: string;
  @IsOptional() @IsNumber() invoiceIssuedDate?: number;
  @IsString() @Length(3, 3) currencyCode: string;
  @IsOptional() @IsIn(['1', '3', '5', '7']) adjustmentType?: string;
  @IsOptional() @IsString() @MaxLength(255) adjustedNote?: string;
  @IsOptional() @IsIn(['1', '2']) adjustmentInvoiceType?: string;
  @IsOptional() @IsString() originalInvoiceId?: string;
  @IsOptional() @IsNumber() originalInvoiceIssueDate?: number;
  @IsOptional() @IsString() additionalReferenceDesc?: string;
  @IsOptional() @IsNumber() additionalReferenceDate?: number;
  @IsBoolean() paymentStatus: boolean;
  @IsOptional() @IsBoolean() cusGetInvoiceRight?: boolean;
  @IsOptional() @IsNumber() exchangeRate?: number;
  @IsString() @MinLength(10) @MaxLength(36) transactionUuid: string;
  @IsOptional() @IsString() @MaxLength(100) certificateSerial?: string;
  @IsOptional() @IsIn(['0', '1', '2', '3', '4']) originalInvoiceType?: string;
  @IsOptional() @IsString() @MaxLength(20) originalTemplateCode?: string;
  @IsOptional() @IsString() @MaxLength(500) invoiceNote?: string;
  @IsOptional() @IsNumber() validation?: number;
}

export class SellerInfoDto {
  @IsOptional() @IsString() @MaxLength(255) sellerLegalName?: string;
  @IsOptional() @IsString() @MaxLength(20) sellerTaxCode?: string;
  @IsOptional() @IsString() @MaxLength(255) sellerAddressLine?: string;
  @IsOptional() @IsString() @MaxLength(50) sellerPhoneNumber?: string;
  @IsOptional() @IsString() @MaxLength(50) sellerFaxNumber?: string;
  @IsOptional() @IsString() @MaxLength(50) sellerEmail?: string;
  @IsOptional() @IsString() @MaxLength(400) sellerBankName?: string;
  @IsOptional() @IsString() @MaxLength(30) sellerBankAccount?: string;
  @IsOptional() @IsString() @MaxLength(50) sellerDistrictName?: string;
  @IsOptional() @IsString() @MaxLength(600) sellerCityName?: string;
  @IsOptional() @IsString() @MaxLength(15) sellerCountryCode?: string;
  @IsOptional() @IsString() @MaxLength(200) sellerWebsite?: string;
  @IsOptional() @IsString() @MaxLength(50) storeCode?: string;
  @IsOptional() @IsString() @MaxLength(400) storeName?: string;
}

export class BuyerInfoDto {
  @IsOptional() @IsString() @MaxLength(800) buyerName?: string;
  @IsOptional() @IsString() @MaxLength(400) buyerCode?: string;
  @IsOptional() @IsString() @MaxLength(1200) buyerLegalName?: string;
  @IsOptional() @IsString() @MaxLength(20) buyerTaxCode?: string;
  @IsOptional() @IsString() @MaxLength(7) buyerBudgetCode?: string;
  @IsOptional() @IsString() @MaxLength(1200) buyerAddressLine?: string;
  @IsOptional() @IsString() @MaxLength(15) buyerPhoneNumber?: string;
  @IsOptional() @IsString() @MaxLength(2000) buyerEmail?: string;
  @IsOptional() @IsString() @MaxLength(200) buyerBankName?: string;
  @IsOptional() @IsString() @MaxLength(30) buyerBankAccount?: string;
  @IsOptional() @IsString() buyerIdType?: string;
  @IsOptional() @IsString() @MaxLength(200) buyerIdNo?: string;
  @IsOptional() @IsIn([0, 1]) buyerNotGetInvoice?: number;
}

export class InvoicePaymentDto {
  @IsOptional() @IsString() paymentMethod?: string;
  @IsString() paymentMethodName: string;
}

export class InvoiceItemDto {
  @IsOptional() @IsInt() selection?: number;
  @IsOptional() @IsString() @MaxLength(50) itemCode?: string;
  @IsOptional() @IsString() @MaxLength(500) itemName?: string;
  @IsOptional() @IsString() @MaxLength(100) unitCode?: string;
  @IsOptional() @IsString() @MaxLength(300) unitName?: string;
  @IsOptional() @IsNumber() unitPrice?: number;
  @IsOptional() @IsNumber() quantity?: number;
  @IsNumber() itemTotalAmountWithoutTax: number;
  @IsOptional() @IsNumber() taxPercentage?: number;
  @IsOptional() @IsNumber() taxAmount?: number;
  @IsOptional() @IsBoolean() isIncreaseItem?: boolean;
  @IsOptional() @IsString() @MaxLength(300) itemNote?: string;
  @IsOptional() @IsString() @MaxLength(300) batchNo?: string;
  @IsOptional() @IsString() @MaxLength(50) expDate?: string;
  @IsOptional() @IsNumber() discount?: number;
  @IsOptional() @IsNumber() discount2?: number;
  @IsOptional() @IsNumber() itemDiscount?: number;
  @IsOptional() @IsNumber() itemTotalAmountAfterDiscount?: number;
  @IsOptional() @IsNumber() itemTotalAmountWithTax?: number;
  @IsOptional() @IsInt() adjustRatio?: number;
}

export class TaxBreakdownDto {
  @IsOptional() @IsNumber() taxPercentage?: number;
  @IsOptional() @IsNumber() taxableAmount?: number;
  @IsOptional() @IsNumber() taxAmount?: number;
  @IsOptional() @IsBoolean() taxableAmountPos?: boolean;
  @IsOptional() @IsBoolean() taxAmountPos?: boolean;
  @IsOptional() @IsString() @MaxLength(255) taxExemptionReason?: string;
}

export class SummarizeInfoDto {
  @IsNumber() totalAmountWithoutTax: number;
  @IsOptional() @IsNumber() totalTaxAmount?: number;
  @IsOptional() @IsNumber() totalAmountWithTax?: number;
  @IsOptional() @IsNumber() totalAmountWithTaxFrn?: number;
  @IsOptional() @IsString() @MaxLength(255) totalAmountWithTaxInWords?: string;
  @IsOptional() @IsBoolean() isTotalAmountPos?: boolean;
  @IsOptional() @IsBoolean() isTotalTaxAmountPos?: boolean;
  @IsOptional() @IsBoolean() isTotalAmtWithoutTaxPos?: boolean;
  @IsNumber() discountAmount: number;
  @IsOptional() @IsNumber() settlementDiscountAmount?: number;
  @IsOptional() @IsBoolean() isDiscountAmtPos?: boolean;
  @IsOptional() @IsString() @MaxLength(500) extraName?: string;
  @IsOptional() @IsString() @MaxLength(500) extraValue?: string;
  @IsOptional() @IsNumber() totalAmountAfterDiscount?: number;
}

export class InvoiceMetadataDto {
  @IsOptional() @IsString() keyTag?: string;
  @IsOptional() @IsIn(['text', 'number', 'date']) valueType?: string;
  @IsOptional() @IsNumber() dateValue?: number;
  @IsOptional() @IsString() @MaxLength(500) stringValue?: string;
  @IsOptional() @IsNumber() numberValue?: number;
  @IsOptional() @IsString() @MaxLength(50) keyLabel?: string;
  @IsOptional() @IsBoolean() isRequired?: boolean;
  @IsOptional() @IsBoolean() isSeller?: boolean;
}

// v2.44 fallback contract does not enumerate the optional fields below.
// Keeping them explicit and empty prevents undocumented data from leaking
// into the signed payload while preserving the documented array shape.
export class MeterReadingDto {}
export class InvoiceFileDto {}
export class QrCodeDto {}

export class ViettelInvoicePayloadDto {
  @ValidateNested()
  @Type(() => GeneralInvoiceInfoDto)
  generalInvoiceInfo: GeneralInvoiceInfoDto;

  @ValidateNested()
  @Type(() => BuyerInfoDto)
  buyerInfo: BuyerInfoDto;

  @ValidateNested()
  @Type(() => SellerInfoDto)
  sellerInfo: SellerInfoDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoicePaymentDto)
  payments: InvoicePaymentDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  itemInfo: InvoiceItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceMetadataDto)
  metadata: InvoiceMetadataDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MeterReadingDto)
  meterReading: MeterReadingDto[];

  @ValidateNested()
  @Type(() => SummarizeInfoDto)
  summarizeInfo: SummarizeInfoDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaxBreakdownDto)
  taxBreakdowns: TaxBreakdownDto[];
}

export class ViettelSecretInvoicePayloadDto extends ViettelInvoicePayloadDto {
  @IsString()
  reservationCode: string;
}
