import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';

export interface CalculatedInvoiceLine {
  amountWithoutTax: Decimal;
  taxAmount: Decimal;
  amountWithTax: Decimal;
}

/** VND invoices carry whole đồng; other currencies keep cents. */
export function currencyDecimalPlaces(currencyCode: string): number {
  return currencyCode.toUpperCase() === 'VND' ? 0 : 2;
}

@Injectable()
export class MoneyCalculatorService {
  calculate(
    grossAmount: Decimal,
    taxPercentage: Decimal,
    pricesIncludeTax: boolean | null,
    decimalPlaces: number,
  ): CalculatedInvoiceLine {
    if (taxPercentage.lte(0)) {
      return {
        amountWithoutTax: grossAmount,
        taxAmount: new Decimal(0),
        amountWithTax: grossAmount,
      };
    }
    if (pricesIncludeTax == null) {
      throw new Error(
        'pricesIncludeTax phải được cấu hình khi thuế suất lớn hơn 0',
      );
    }
    if (pricesIncludeTax) {
      // Giá chưa thuế = giá thanh toán / (1 + thuế suất); thuế = phần còn lại,
      // so the two parts always add back up to exactly what was paid.
      const amountWithoutTax = grossAmount
        .div(new Decimal(1).plus(taxPercentage.div(100)))
        .toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_UP);
      return {
        amountWithoutTax,
        taxAmount: grossAmount.minus(amountWithoutTax),
        amountWithTax: grossAmount,
      };
    }
    const taxAmount = grossAmount
      .mul(taxPercentage)
      .div(100)
      .toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_UP);
    return {
      amountWithoutTax: grossAmount,
      taxAmount,
      amountWithTax: grossAmount.plus(taxAmount),
    };
  }
}
