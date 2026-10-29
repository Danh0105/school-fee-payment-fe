import Decimal from 'decimal.js';
import {
  BillingType,
  PaymentMethod,
} from '../../../../common/enums/status.enum';
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

describe('ViettelSinvoiceMapper người mua', () => {
  const mapper = new ViettelSinvoiceMapper(new MoneyCalculatorService());
  const invoice = {
    templateCode: '1/001',
    invoiceSeries: 'C26TIS',
    adjustmentType: '1',
    transactionUuid: '5f8bf423-5002-4dcf-9ca9-16853328eabe',
  } as EInvoice;
  const receipt = {
    paymentMethod: PaymentMethod.VIETQR,
    items: [
      { receivableId: null, description: 'Học phí', amount: new Decimal(1) },
    ],
  } as unknown as Receipt;
  const config = {
    currencyCode: 'VND',
    taxPercentage: '-1',
    pricesIncludeTax: null,
  } as EInvoiceConfig;
  const student = (overrides: Partial<Student> = {}) =>
    ({
      fullName: 'Nguyễn Văn A',
      studentCode: 'HS001',
      identifierCode: '079123456789',
      address: '12 Lê Lợi, Quận 1, TP Hồ Chí Minh',
      parentName: 'Nguyễn Văn B',
      parentPhone: '0901234567',
      phone: null,
      parentEmail: 'b@example.com',
      ...overrides,
    }) as unknown as Student;

  it('hóa đơn đứng tên học sinh: họ tên, mã định danh ở ô căn cước công dân, địa chỉ học sinh', () => {
    const { buyerInfo } = mapper.fromReceipt(
      invoice,
      receipt,
      student(),
      config,
    );
    expect(buyerInfo).toMatchObject({
      buyerName: 'Nguyễn Văn A',
      buyerCode: 'HS001',
      buyerIdType: '1',
      buyerIdNo: '079123456789',
      buyerAddressLine: '12 Lê Lợi, Quận 1, TP Hồ Chí Minh',
      buyerPhoneNumber: '0901234567',
      buyerEmail: 'b@example.com',
    });
  });

  it('học sinh chưa có mã định danh và địa chỉ thì bỏ trống các ô đó', () => {
    const { buyerInfo } = mapper.fromReceipt(
      invoice,
      receipt,
      student({ identifierCode: null, address: null }),
      config,
    );
    expect(buyerInfo.buyerName).toBe('Nguyễn Văn A');
    expect(buyerInfo.buyerIdType).toBeUndefined();
    expect(buyerInfo.buyerIdNo).toBeUndefined();
    expect(buyerInfo.buyerAddressLine).toBeUndefined();
  });
});

describe('ViettelSinvoiceMapper theo mẫu hóa đơn của trường', () => {
  const mapper = new ViettelSinvoiceMapper(new MoneyCalculatorService());
  const config = {
    currencyCode: 'VND',
    taxPercentage: '-1',
    pricesIncludeTax: null,
  } as EInvoiceConfig;
  const invoiceAt = (school: { name: string; address: string | null }) =>
    ({
      templateCode: '1/001',
      invoiceSeries: 'C26TIS',
      adjustmentType: '1',
      transactionUuid: '5f8bf423-5002-4dcf-9ca9-16853328eabe',
      school,
    }) as unknown as EInvoice;
  const student = {
    fullName: 'Bùi Võ Thiên Kim',
    studentCode: 'HS001',
    identifierCode: '072318006720',
    address: null,
  } as unknown as Student;
  const receiptOf = (
    ...items: {
      description: string;
      amount: number;
      receivable?: {
        academicYear: { name: string };
        feePlan: { billingType: BillingType };
        quantity: Decimal;
      };
    }[]
  ) =>
    ({
      paymentMethod: PaymentMethod.VIETINBANK,
      items: items.map((item) => ({
        receivableId: item.receivable ? 'receivable-id' : null,
        receivable: item.receivable ?? null,
        description: item.description,
        amount: new Decimal(item.amount),
      })),
    }) as unknown as Receipt;

  it('học sinh không có địa chỉ nhà: địa chỉ là lớp, trường và địa chỉ trường', () => {
    const { buyerInfo } = mapper.fromReceipt(
      invoiceAt({
        name: 'TH Võ Thị Sáu',
        address: 'Phường Tân Ninh, Tỉnh Tây Ninh',
      }),
      receiptOf({ description: 'Học phí', amount: 560000 }),
      student,
      config,
      '3B5',
    );
    expect(buyerInfo.buyerAddressLine).toBe(
      'Lớp 3B5, Trường TH Võ Thị Sáu, Phường Tân Ninh, Tỉnh Tây Ninh',
    );
  });

  it('không lặp chữ "Lớp", "Trường"; trường chưa có địa chỉ thì chỉ lớp và trường', () => {
    const { buyerInfo } = mapper.fromReceipt(
      invoiceAt({ name: 'Trường Tiểu học Kim Đồng', address: null }),
      receiptOf({ description: 'Học phí', amount: 560000 }),
      student,
      config,
      'Lớp 2A1',
    );
    expect(buyerInfo.buyerAddressLine).toBe(
      'Lớp 2A1, Trường Tiểu học Kim Đồng',
    );
  });

  it('dòng hàng: dịch vụ + năm học + số tháng, đơn vị "Học sinh", số lượng 1', () => {
    const { itemInfo } = mapper.fromReceipt(
      invoiceAt({ name: 'TH Võ Thị Sáu', address: null }),
      receiptOf(
        {
          description: 'Học phí chương trình giáo dục Tiếng Anh',
          amount: 560000,
          receivable: {
            academicYear: { name: '2026-2027' },
            feePlan: { billingType: BillingType.MONTHLY },
            quantity: new Decimal('7.00'),
          },
        },
        {
          description: 'Bán trú năm học 2026-2027',
          amount: 100000,
          receivable: {
            academicYear: { name: '2026-2027' },
            feePlan: { billingType: BillingType.ONE_TIME },
            quantity: new Decimal(1),
          },
        },
        { description: 'Tiền thừa (giữ lại số dư có)', amount: 5000 },
      ),
      student,
      config,
    );
    expect(itemInfo.map((item) => item.itemName)).toEqual([
      'Học phí chương trình giáo dục Tiếng Anh năm học 2026-2027 (7 tháng)',
      'Bán trú năm học 2026-2027',
      'Tiền thừa (giữ lại số dư có)',
    ]);
    expect(itemInfo[0]).toMatchObject({
      unitName: 'Học sinh',
      quantity: 1,
      unitPrice: 560000,
      itemTotalAmountWithTax: 560000,
    });
  });

  it('ưu tiên đủ 8 thông tin hóa đơn đã chốt từ dòng import', () => {
    const importedReceivable = {
      academicYear: { name: '2026-2027' },
      feePlan: { billingType: BillingType.ONE_TIME },
      invoiceBuyerName: 'Nguyễn Văn B',
      invoiceBuyerAddress: 'Lớp 1A1, Trường TH Demo, Tỉnh Mẫu',
      invoiceBuyerIdNo: '079123456789',
      invoiceUnitName: 'Học sinh',
      quantity: new Decimal(1),
      unitPrice: new Decimal(560000),
      originalAmount: new Decimal(560000),
    };
    const payload = mapper.fromReceipt(
      invoiceAt({ name: 'TH Demo', address: null }),
      receiptOf({
        description:
          'Chương trình giáo dục AI và STEM năm học 2026-2027 (7 tháng)',
        amount: 560000,
        receivable: importedReceivable,
      }),
      student,
      config,
      '1A1',
    );

    expect(payload.buyerInfo).toMatchObject({
      buyerName: 'Nguyễn Văn B',
      buyerAddressLine: 'Lớp 1A1, Trường TH Demo, Tỉnh Mẫu',
      buyerIdNo: '079123456789',
    });
    expect(payload.itemInfo).toEqual([
      expect.objectContaining({
        itemName:
          'Chương trình giáo dục AI và STEM năm học 2026-2027 (7 tháng)',
        unitName: 'Học sinh',
        quantity: 1,
        unitPrice: 560000,
        itemTotalAmountWithTax: 560000,
      }),
    ]);
  });
});
