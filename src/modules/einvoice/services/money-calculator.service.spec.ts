import Decimal from 'decimal.js';
import {
  currencyDecimalPlaces,
  MoneyCalculatorService,
} from './money-calculator.service';

describe('MoneyCalculatorService', () => {
  const calc = new MoneyCalculatorService();

  it('giá đã gồm thuế: tách đúng giá chưa thuế/thuế theo đồng', () => {
    const line = calc.calculate(
      new Decimal(720000),
      new Decimal(8),
      true,
      currencyDecimalPlaces('VND'),
    );
    expect(line.amountWithoutTax.toNumber()).toBe(666667);
    expect(line.taxAmount.toNumber()).toBe(53333);
    expect(line.amountWithTax.toNumber()).toBe(720000);
  });

  it.each([5, 8, 10])(
    'giá đã gồm thuế %i%%: giá chưa thuế + thuế luôn bằng số tiền đã thu, không lẻ đồng',
    (rate) => {
      for (let gross = 100_000; gross <= 5_000_000; gross += 1_000) {
        const line = calc.calculate(
          new Decimal(gross),
          new Decimal(rate),
          true,
          0,
        );
        expect(line.amountWithoutTax.plus(line.taxAmount).toNumber()).toBe(
          gross,
        );
        expect(line.amountWithoutTax.isInteger()).toBe(true);
        expect(line.taxAmount.isInteger()).toBe(true);
      }
    },
  );

  it('giá chưa gồm thuế: thuế làm tròn theo đồng và cộng vào tổng', () => {
    const line = calc.calculate(new Decimal(105555), new Decimal(8), false, 0);
    expect(line.amountWithoutTax.toNumber()).toBe(105555);
    expect(line.taxAmount.toNumber()).toBe(8444);
    expect(line.amountWithTax.toNumber()).toBe(113999);
  });

  it('ngoại tệ giữ 2 chữ số thập phân', () => {
    const line = calc.calculate(
      new Decimal(100),
      new Decimal(8),
      true,
      currencyDecimalPlaces('USD'),
    );
    expect(line.amountWithoutTax.toNumber()).toBe(92.59);
    expect(line.taxAmount.toNumber()).toBe(7.41);
  });

  it('không chịu thuế (-2): giữ nguyên số tiền', () => {
    const line = calc.calculate(new Decimal(720000), new Decimal(-2), null, 0);
    expect(line.amountWithoutTax.toNumber()).toBe(720000);
    expect(line.taxAmount.toNumber()).toBe(0);
  });
});
