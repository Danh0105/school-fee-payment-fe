import { Injectable } from '@nestjs/common';
import { validateSync } from 'class-validator';
import Decimal from 'decimal.js';
import { Receipt } from '../../../../receipts/entities/receipt.entity';
import { ReceiptItem } from '../../../../receipts/entities/receipt-item.entity';
import { School } from '../../../../schools/entities/school.entity';
import { Student } from '../../../../students/entities/student.entity';
import { EInvoice } from '../../entities/einvoice.entity';
import { EInvoiceConfig } from '../../entities/einvoice-config.entity';
import {
  currencyDecimalPlaces,
  MoneyCalculatorService,
} from '../../services/money-calculator.service';
import {
  BuyerInfoDto,
  GeneralInvoiceInfoDto,
  InvoiceItemDto,
  InvoicePaymentDto,
  SellerInfoDto,
  SummarizeInfoDto,
  TaxBreakdownDto,
  ViettelInvoicePayloadDto,
} from './dto/invoice-payload.dto';
import { ViettelSinvoiceException } from './exceptions/viettel-sinvoice.exception';
import {
  BillingType,
  PaymentMethod,
} from '../../../../common/enums/status.enum';

/** Viettel buyerIdType for a citizen ID / personal identification number. */
const BUYER_ID_TYPE_CITIZEN_ID = '1';

/**
 * "Hình thức thanh toán" printed on the invoice must match how the parent
 * actually paid. Only CK keeps the numeric code the integration was built
 * with; the others send the name alone, which Viettel accepts on its own.
 */
function paymentOf(
  method: PaymentMethod,
): Pick<InvoicePaymentDto, 'paymentMethod' | 'paymentMethodName'> {
  switch (method) {
    case PaymentMethod.CASH:
      return { paymentMethodName: 'TM' };
    case PaymentMethod.OTHER:
      return { paymentMethodName: 'TM/CK' };
    default:
      return { paymentMethod: '2', paymentMethodName: 'CK' };
  }
}

/**
 * "Lớp 3A4, Trường TH Võ Thị Sáu, <school address>": the buyer address of a
 * student whose home address is unknown, as schools print it.
 */
export function classSchoolAddress(
  className: string | null,
  school: Pick<School, 'name' | 'address'> | null | undefined,
): string | null {
  const klass = className?.replace(/^lớp\s+/iu, '').trim();
  const schoolName = school?.name?.trim();
  const parts = [
    klass ? `Lớp ${klass}` : null,
    schoolName
      ? /^trường\s/iu.test(schoolName)
        ? schoolName
        : `Trường ${schoolName}`
      : null,
    school?.address?.trim() || null,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/**
 * "Học phí năm học 2026-2027 (7 tháng)": what the line pays for, its school
 * year and, for a monthly fee, how many months.
 */
export function invoiceItemName(
  item: Pick<ReceiptItem, 'description' | 'receivable'>,
): string {
  const receivable = item.receivable;
  let name = item.description.trim();
  const year = receivable?.academicYear?.name?.trim();
  if (year && !name.toLowerCase().includes(year.toLowerCase())) {
    name += ` năm học ${year}`;
  }
  const months = receivable ? new Decimal(receivable.quantity) : null;
  if (
    receivable?.feePlan?.billingType === BillingType.MONTHLY &&
    months?.gt(1)
  ) {
    name += ` (${months.toString()} tháng)`;
  }
  return name.slice(0, 500);
}

@Injectable()
export class ViettelSinvoiceMapper {
  constructor(private readonly money: MoneyCalculatorService) {}

  fromReceipt(
    invoice: EInvoice,
    receipt: Receipt,
    student: Student,
    config: EInvoiceConfig,
    /** The student's class that school year, for the buyer address. */
    className: string | null = null,
  ): ViettelInvoicePayloadDto {
    if (config.taxPercentage == null) {
      throw new ViettelSinvoiceException(
        'VALIDATION_ERROR',
        null,
        'TAX_CONFIG_REQUIRED',
        'Chưa cấu hình thuế suất hóa đơn',
        'mapper',
        invoice.transactionUuid,
        false,
      );
    }
    const taxPercentage = new Decimal(config.taxPercentage);
    if (taxPercentage.gt(0) && config.pricesIncludeTax == null) {
      throw new ViettelSinvoiceException(
        'VALIDATION_ERROR',
        null,
        'TAX_CONFIG_REQUIRED',
        'Chưa cấu hình giá đã gồm thuế hay chưa (pricesIncludeTax) cho thuế suất lớn hơn 0',
        'mapper',
        invoice.transactionUuid,
        false,
      );
    }
    const decimalPlaces = currencyDecimalPlaces(config.currencyCode);
    const lines = receipt.items.map((item) => ({
      item,
      calculated: this.money.calculate(
        item.amount,
        taxPercentage,
        config.pricesIncludeTax,
        decimalPlaces,
      ),
    }));

    const itemInfo = lines.map(({ item, calculated }): InvoiceItemDto =>
      Object.assign(new InvoiceItemDto(), {
        selection: 1,
        itemCode: item.receivableId ?? undefined,
        itemName: invoiceItemName(item),
        unitName: 'Học sinh',
        quantity: 1,
        unitPrice: calculated.amountWithoutTax.toNumber(),
        itemTotalAmountWithoutTax: calculated.amountWithoutTax.toNumber(),
        taxPercentage: taxPercentage.toNumber(),
        taxAmount: calculated.taxAmount.toNumber(),
        itemTotalAmountWithTax: calculated.amountWithTax.toNumber(),
        isIncreaseItem: true,
      }),
    );
    const totalWithoutTax = lines.reduce(
      (sum, line) => sum.plus(line.calculated.amountWithoutTax),
      new Decimal(0),
    );
    const totalTax = lines.reduce(
      (sum, line) => sum.plus(line.calculated.taxAmount),
      new Decimal(0),
    );
    const totalWithTax = lines.reduce(
      (sum, line) => sum.plus(line.calculated.amountWithTax),
      new Decimal(0),
    );

    const generalInvoiceInfo = Object.assign(new GeneralInvoiceInfoDto(), {
      templateCode: invoice.templateCode,
      invoiceSeries: invoice.invoiceSeries,
      invoiceIssuedDate: Date.now(),
      currencyCode: config.currencyCode,
      adjustmentType: invoice.adjustmentType,
      paymentStatus: true,
      cusGetInvoiceRight: true,
      transactionUuid: invoice.transactionUuid,
    });
    // The invoice is made out to the student: name, personal identification
    // number (printed in the "Căn cước công dân" box) and address, else the
    // class and school.
    const buyerInfo = Object.assign(new BuyerInfoDto(), {
      buyerName: student.fullName,
      buyerCode: student.studentCode,
      buyerAddressLine:
        student.address?.trim() ||
        classSchoolAddress(className, invoice.school) ||
        undefined,
      buyerIdType: student.identifierCode
        ? BUYER_ID_TYPE_CITIZEN_ID
        : undefined,
      buyerIdNo: student.identifierCode ?? undefined,
      buyerPhoneNumber: student.parentPhone ?? student.phone ?? undefined,
      buyerEmail: invoice.buyerEmail ?? student.parentEmail ?? undefined,
      buyerNotGetInvoice: 0,
    });
    const sellerInfo = Object.assign(new SellerInfoDto(), {});
    const payments = [
      Object.assign(new InvoicePaymentDto(), paymentOf(receipt.paymentMethod)),
    ];
    const summarizeInfo = Object.assign(new SummarizeInfoDto(), {
      totalAmountWithoutTax: totalWithoutTax.toNumber(),
      totalTaxAmount: totalTax.toNumber(),
      totalAmountWithTax: totalWithTax.toNumber(),
      discountAmount: 0,
      totalAmountAfterDiscount: totalWithoutTax.toNumber(),
      isTotalAmountPos: true,
      isTotalTaxAmountPos: true,
      isTotalAmtWithoutTaxPos: true,
    });
    const taxBreakdowns = [
      Object.assign(new TaxBreakdownDto(), {
        taxPercentage: taxPercentage.toNumber(),
        taxableAmount: totalWithoutTax.toNumber(),
        taxAmount: totalTax.toNumber(),
        taxableAmountPos: true,
        taxAmountPos: true,
      }),
    ];
    const payload = Object.assign(new ViettelInvoicePayloadDto(), {
      generalInvoiceInfo,
      buyerInfo,
      sellerInfo,
      payments,
      itemInfo,
      metadata: [],
      meterReading: [],
      summarizeInfo,
      taxBreakdowns,
    });
    const errors = validateSync(payload, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) {
      throw new ViettelSinvoiceException(
        'VALIDATION_ERROR',
        null,
        'PAYLOAD_VALIDATION_ERROR',
        errors.toString(),
        'mapper',
        invoice.transactionUuid,
        false,
      );
    }
    return payload;
  }
}
