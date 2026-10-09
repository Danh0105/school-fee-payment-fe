import Decimal from 'decimal.js';
import { PaymentMethod } from '../../../../common/enums/status.enum';
import { Receipt } from '../../../../receipts/entities/receipt.entity';
import { Student } from '../../../../students/entities/student.entity';
import { EInvoice } from '../../entities/einvoice.entity';
import { EInvoiceConfig } from '../../entities/einvoice-config.entity';
import { MoneyCalculatorService } from '../../services/money-calculator.service';
import { ViettelSinvoiceMapper } from './viettel-sinvoice.mapper';

describe('ViettelSinvoiceMapper hình thức thanh toán', () => {
  const mapper = new ViettelSinvoiceMapper(new MoneyCalculatorService());
  const invoice = {
    templateCode: '1/001',
    invoiceSeries: 'C26TAA',
    adjustmentType: '1',
    transactionUuid: '5f8bf423-5002-4dcf-9ca9-16853328eabe',
  } as EInvoice;
  const student = {
    fullName: 'Nguyễn Văn A',
    studentCode: 'HS001',
    parentName: 'Nguyễn Văn B',
    address: null,
    parentPhone: null,
    phone: null,
    parentEmail: null,
  } as unknown as Student;
  const config = {
    currencyCode: 'VND',
    taxPercentage: '-2',
    pricesIncludeTax: null,
  } as EInvoiceConfig;
  const receiptPaidBy = (paymentMethod: PaymentMethod) =>
    ({
      paymentMethod,
      items: [
        { receivableId: null, description: 'Học phí', amount: new Decimal(1) },
      ],
    }) as unknown as Receipt;

  it.each([
    [PaymentMethod.CASH, { paymentMethodName: 'TM' }],
    [PaymentMethod.OTHER, { paymentMethodName: 'TM/CK' }],
    [
      PaymentMethod.BANK_TRANSFER,
      { paymentMethod: '2', paymentMethodName: 'CK' },
    ],
    [PaymentMethod.VIETQR, { paymentMethod: '2', paymentMethodName: 'CK' }],
    [PaymentMethod.VIETINBANK, { paymentMethod: '2', paymentMethodName: 'CK' }],
  ])('phiếu thu %s → %j', (method, expected) => {
    const payload = mapper.fromReceipt(
      invoice,
      receiptPaidBy(method),
      student,
      config,
    );

    expect(payload.payments).toEqual([expect.objectContaining(expected)]);
    if (!('paymentMethod' in expected)) {
      expect(payload.payments[0].paymentMethod).toBeUndefined();
    }
  });
});
