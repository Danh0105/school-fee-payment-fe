import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { EInvoiceStatus } from '../entities/einvoice.enums';

export class QueryEInvoiceDto extends PaginationQueryDto {
  @IsOptional() @IsUUID() schoolId?: string;
  @IsOptional() @IsUUID() studentId?: string;
  @IsOptional() @IsUUID() receiptId?: string;
  @IsOptional() @IsEnum(EInvoiceStatus) status?: EInvoiceStatus;
}
