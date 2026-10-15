import { ApiProperty } from '@nestjs/swagger';
import { EInvoiceStatus } from '../entities/einvoice.enums';

/** Before a payment is matched there is no invoice yet, only the request. */
export type ParentEInvoiceStatus = 'PENDING_PAYMENT' | EInvoiceStatus;

/** The e-invoice a parent requested on a payment order, as the parent sees it. */
export class ParentEInvoiceSummaryDto {
  @ApiProperty({
    enum: ['PENDING_PAYMENT', ...Object.values(EInvoiceStatus)],
    example: 'PENDING_PAYMENT',
    description:
      'PENDING_PAYMENT: đơn chưa được thanh toán. CANCELLED: đơn hết hạn/hủy/thất bại hoặc hóa đơn bị hủy. Các giá trị còn lại theo vòng đời hóa đơn điện tử.',
  })
  status: ParentEInvoiceStatus;

  @ApiProperty({ example: 'phuhuynh@example.com' })
  buyerEmail: string;

  @ApiProperty({ type: String, nullable: true, example: null })
  invoiceNo: string | null;

  @ApiProperty({ type: Date, nullable: true, example: null })
  issuedAt: Date | null;

  @ApiProperty({ type: Date, nullable: true, example: null })
  emailSentAt: Date | null;
}
