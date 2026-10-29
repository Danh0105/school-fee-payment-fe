import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { ViettelInvoicePayloadDto } from './invoice-payload.dto';

export class InvoiceFileRequestDto {
  @IsString() supplierTaxCode: string;
  @IsString() invoiceNo: string;
  @IsString() templateCode: string;
  @IsOptional() @IsString() transactionUuid?: string;
  @IsOptional() @IsIn(['PDF', 'ZIP']) fileType?: 'PDF' | 'ZIP';
  @IsOptional() @IsBoolean() paid?: boolean;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
}

export class PortalFileRequestDto {
  @IsString() supplierTaxCode: string;
  @IsString() templateCode: string;
  @IsString() invoiceNo: string;
  @IsString() reservationCode: string;
  @IsString() fileType: string;
  @IsString() strIssueDate: string;
  @IsOptional() @IsString() buyerIdNo?: string;
}

export class ExchangeFileRequestDto {
  @IsString() supplierTaxCode: string;
  @IsString() invoiceNo: string;
  @IsString() strIssueDate: string;
  @IsString() exchangeUser: string;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
}

export class SearchByTransactionUuidDto {
  @IsString() supplierTaxCode: string;
  @IsString() transactionUuid: string;
}

export class CancelInvoiceDto {
  @IsString() supplierTaxCode: string;
  @IsString() invoiceNo: string;
  @IsString() strIssueDate: string;
  @IsString() additionalReferenceDesc: string;
  @IsString() additionalReferenceDate: string;
  @IsOptional() @IsString() templateCode?: string;
  @IsOptional() @IsString() reasonDelete?: string;
}

export class SendInvoiceEmailDto {
  @IsString() supplierTaxCode: string;
  @IsString() lstTransactionUuid: string;
}

export class SendEmailToCustomerDto {
  @IsString() supplierTaxCode: string;
  @IsString() transactionUuid: string;
  @IsEmail() buyerEmail: string;
}

export class SignatureDto {
  @IsString() supplierTaxCode: string;
  @IsString() templateCode: string;
  @IsString() hashString: string;
  @IsString() signature: string;
}

export class ReservationCodeRequestDto {
  @IsOptional() @IsString() transactionUuid?: string;
  @IsString() requestCode: string;
  @IsOptional() @IsString() expiredDate?: string;
}

export class UpdatePrintStatusDto {
  @IsString() taxCode: string;
  @IsString() templateCode: string;
  @IsString() invoiceNo: string;
  @IsString() printStatus: string;
}

export class UpdateQrScanDto {
  @IsString() taxCode: string;
  @IsString() templateCode: string;
  @IsString() invoiceNo: string;
}

export class SendToTaxAuthorityDto {
  @IsString() supplierTaxCode: string;
  @IsString() transactionUuid: string;
  @IsString() startDate: string;
  @IsString() endDate: string;
}

export class UpdateTaxDeclarationDto {
  @IsString() supplierTaxCode: string;
  @IsString() strIssueDate: string;
}

export class UsageRangeDto {
  @IsString() supplierTaxCode: string;
  @IsString() templateCode: string;
  @IsString() serial: string;
}

export class SendBatchInvoiceDto {
  @IsArray() invoices: ViettelInvoicePayloadDto[];
}

export class DateRangeDto {
  @IsString() supplierTaxCode: string;
  @IsString() fromDate: string;
  @IsString() toDate: string;
  @IsOptional() @IsString() adjustmentType?: string;
}

export class ConvertFontDto {
  @IsString() font: string;
  @IsString() data: string;
}

export class PaymentStatusDto {
  @IsString() supplierTaxCode: string;
  @IsString() invoiceNo: string;
  @IsString() strIssueDate: string;
  @IsOptional() @IsString() templateCode?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() paymentType?: string;
}

export class TemplateQueryDto {
  @IsString() taxCode: string;
  @IsString() invoiceType: string;
}

export class InvoiceExplanationDto {
  @IsString() supplierTaxCode: string;
  @IsString() templateCode: string;
  @IsString() invoiceNo: string;
  @IsString() strIssueDate: string;
  @IsOptional() @IsString() reason?: string;
}

export class InvoiceUsageQueryDto {
  @IsString() supplierTaxCode: string;
  @IsOptional() @IsString() createdUser?: string;
  @IsOptional() @IsString() fromDate?: string;
  @IsOptional() @IsString() toDate?: string;
}

export class SearchInvoicesDto {
  @IsOptional() @IsString() invoiceNo?: string;
  @IsOptional() @IsString() invoiceType?: string;
  @IsOptional() @IsString() buyerTaxCode?: string;
  @IsOptional() @IsString() buyerIdNo?: string;
  @IsOptional() @IsString() templateCode?: string;
  @IsOptional() @IsString() invoiceSeri?: string;
  @IsOptional() @IsString() adjustmentType?: string;
  /** Viettel 7.6 requires ISO calendar dates (yyyy-MM-dd). */
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsNumber() pageNum?: number;
  @IsOptional() @IsNumber() rowPerPage?: number;
  @IsOptional() @IsBoolean() getAll?: boolean;
  // Kept for the other list endpoint variants exposed by the provider.
  @IsOptional() @IsString() fromDate?: string;
  @IsOptional() @IsString() toDate?: string;
  @IsOptional() @IsNumber() start?: number;
  @IsOptional() @IsNumber() maxResult?: number;
}
