import { Body, Controller, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/decorators/public.decorator';
import { RawResponse } from '../common/decorators/raw-response.decorator';
import { CryptoKeyService } from './crypto-key.service';
import { InqBillRequestDto, InqBillResponse } from './dto/inq-bill.dto';
import { NotifyBillRequestDto, NotifyBillResponse } from './dto/notify-bill.dto';
import { PaymentOrdersService } from '../payment-orders/payment-orders.service';
import { PaymentTransactionsService } from '../payment-transactions/payment-transactions.service';
import { PaymentOrderStatus, PaymentProviderCode } from '../common/enums/status.enum';

const n = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/**
 * Endpoints VietinBank calls directly (per their eBank Biz collection
 * spec), as opposed to a generic gateway webhook: inq-bill asks "does this
 * bill exist and how much is owed" before crediting, notify-bill confirms
 * money actually moved. Both require a synchronously RSA-signed response in
 * VietinBank's own envelope, so they can't go through the generic
 * WebhooksController (see payment-transactions/webhooks.controller.ts).
 */
@Controller()
export class ViettinbankController {
  constructor(
    private readonly crypto: CryptoKeyService,
    private readonly paymentOrdersService: PaymentOrdersService,
    private readonly paymentTransactionsService: PaymentTransactionsService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @RawResponse()
  @Post('vpg/collection/api/v1/inq-bill')
  async inqBill(@Body() dto: InqBillRequestDto): Promise<InqBillResponse> {
    const { header, data } = dto;

    if (!header || !data || !data.transId || !data.transTime || !data.custCode) {
      return this.buildInqBillResponse(dto, '', '', '0', '99', 'Thiếu dữ liệu bắt buộc');
    }

    const verifyString = n(data.transId) + n(data.transTime) + n(data.custCode);
    if (!this.crypto.verify(verifyString, header.signature)) {
      return this.buildInqBillResponse(dto, '', '', '0', '01', 'Sai chữ ký');
    }

    const order = await this.paymentOrdersService.findByTransferContent(
      this.stripVac(data.custCode),
    );
    if (!order) {
      return this.buildInqBillResponse(dto, '', '', '0', '02', 'Ma KH/Hoa don khong ton tai');
    }
    if (
      ![PaymentOrderStatus.PENDING, PaymentOrderStatus.PARTIALLY_PAID].includes(
        order.status,
      )
    ) {
      return this.buildInqBillResponse(dto, '', '', '0', '02', 'Ma KH/Hoa don khong ton tai');
    }
    if (order.expiresAt && new Date() > order.expiresAt) {
      return this.buildInqBillResponse(dto, '', '', '0', '02', 'Hoa don het han');
    }

    return this.buildInqBillResponse(
      dto,
      `Order ${order.orderCode}`,
      order.requestedAmount.toFixed(0),
      '0',
      '00',
      'Xử lý thành công',
    );
  }

  // A confirmed-working reference integration (another VietinBank partner
  // on this same infra) registers notify-bill at bare 'api/v1/notify-bill'
  // — no 'vpg/collection/' prefix, unlike inq-bill. The doc's §2.2.1 table
  // lists both under vpg/collection/api/v1/, which doesn't match that
  // reference. Registering both paths here so neither convention 404s,
  // since getting this wrong silently drops real payment-received
  // callbacks (order never flips to PAID despite money moving).
  @Public()
  @RawResponse()
  @Post(['vpg/collection/api/v1/notify-bill', 'api/v1/notify-bill'])
  async notifyBill(
    @Body() dto: NotifyBillRequestDto,
  ): Promise<NotifyBillResponse> {
    try {
      const result = await this.paymentTransactionsService.ingest(
        PaymentProviderCode.VIETINBANK,
        dto as unknown as Record<string, unknown>,
        {},
      );
      if (!result.matched && !result.duplicate) {
        return this.buildNotifyResponse(dto, '05', 'Khong khop don hang');
      }
      return this.buildNotifyResponse(dto, '00', 'Thanh cong');
    } catch {
      return this.buildNotifyResponse(dto, '01', 'Sai chữ ký');
    }
  }

  private buildInqBillResponse(
    dto: InqBillRequestDto,
    custName: string,
    amount: string,
    billId: string,
    errorCode: string,
    errorDesc: string,
  ): InqBillResponse {
    const header = dto.header ?? ({} as InqBillRequestDto['header']);
    const data = dto.data ?? ({} as InqBillRequestDto['data']);
    const details = {
      transId: n(data.transId),
      transTime: n(data.transTime),
      custCode: n(data.custCode),
      custName,
      billId: billId === '0' ? null : billId,
      amount,
      amountMin: null,
      preseve1: null,
      preseve2: null,
      preseve3: null,
    };
    const signData =
      details.transId +
      details.transTime +
      details.custCode +
      details.custName +
      n(details.billId) +
      details.amount +
      errorCode;

    return {
      header: {
        msgId: n(header.msgId),
        msgType: '1110',
        channelId: n(header.channelId),
        gatewayId: header.gatewayId,
        providerId: n(header.providerId),
        merchantId: n(header.merchantId),
        productId: n(header.productId),
        timestamp: this.timestamp(),
        signature: this.crypto.sign(signData),
      },
      data: {
        errors: { errorCode, errorDesc },
        details,
      },
    };
  }

  private buildNotifyResponse(
    dto: NotifyBillRequestDto,
    errorCode: string,
    errorDesc: string,
  ): NotifyBillResponse {
    const signData = n(dto.transId) + errorCode + errorDesc;
    return {
      transId: dto.transId,
      providerId: dto.providerId,
      errorCode,
      errorDesc,
      signature: this.crypto.sign(signData),
    };
  }

  /**
   * custCode from VietinBank is VAC + VAV (see doc §2.2.2: "Cấu trúc: VAC +
   * VAV") — VAC is our fixed virtual-account prefix (config
   * viettinbank.account), VAV is the order's own transferContent. Strip it
   * so the lookup matches PaymentOrder.transferContent, which stores VAV
   * only.
   */
  private stripVac(custCode: string): string {
    const vac = this.config.get<string>('viettinbank.account') ?? '';
    return vac && custCode.startsWith(vac)
      ? custCode.slice(vac.length)
      : custCode;
  }

  private timestamp(): string {
    const d = new Date();
    const pad = (v: number) => v.toString().padStart(2, '0');
    return (
      d.getFullYear().toString() +
      pad(d.getMonth() + 1) +
      pad(d.getDate()) +
      pad(d.getHours()) +
      pad(d.getMinutes()) +
      pad(d.getSeconds())
    );
  }
}
