import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiExtraModels,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { ParentJwtAuthGuard } from './guards/parent-jwt-auth.guard';
import { CurrentParent } from './decorators/current-parent.decorator';
import type { ParentAuthUser } from './interfaces/parent-auth-user.interface';
import { StudentsService } from '../students/students.service';
import { ReceivablesService } from '../receivables/receivables.service';
import { PaymentOrdersService } from '../payment-orders/payment-orders.service';
import { CreateParentPaymentOrderDto } from './dto/create-parent-payment-order.dto';
import { EInvoiceService } from '../modules/einvoice/einvoice.service';
import { ParentEInvoiceSummaryDto } from '../modules/einvoice/dto/parent-einvoice-summary.dto';
import { PaymentOrder } from '../payment-orders/entities/payment-order.entity';
import { PaymentMethod } from '../common/enums/status.enum';

const RECEIVABLE_EXAMPLE = '7d4f0c1e-3b8a-4f5e-9c2d-1a6b8e9f0a12';

// @Public() skips the global staff JwtAuthGuard ('jwt' strategy); the
// controller-level ParentJwtAuthGuard below is what actually authenticates
// every route here against the separate 'jwt-parent' strategy. Every route
// only ever touches the single studentId embedded in the caller's token —
// there is no broader "parent account" to scope from.
@ApiTags('Parent Portal')
@ApiBearerAuth()
@ApiExtraModels(ParentEInvoiceSummaryDto)
@Public()
@UseGuards(ParentJwtAuthGuard)
@Controller('parent')
export class ParentPortalController {
  constructor(
    private readonly studentsService: StudentsService,
    private readonly receivablesService: ReceivablesService,
    private readonly paymentOrdersService: PaymentOrdersService,
    private readonly einvoiceService: EInvoiceService,
  ) {}

  /**
   * Parent QR orders always use VietinBank's virtual account. Never let the
   * global default provider or a legacy VIETQR client request silently switch
   * parents back to a QR targeting the school's main bank account.
   */
  private qrMethodFor(requested?: PaymentMethod): PaymentMethod | undefined {
    if (
      requested === undefined ||
      requested === PaymentMethod.VIETQR ||
      requested === PaymentMethod.BANK_TRANSFER
    ) {
      return PaymentMethod.VIETINBANK;
    }
    return requested;
  }

  private assertOwnsOrder(parent: ParentAuthUser, orderStudentId: string) {
    if (orderStudentId !== parent.studentId) {
      throw AppException.forbidden(ErrorCode.FORBIDDEN);
    }
  }

  @Get('me')
  async myStudent(@CurrentParent() parent: ParentAuthUser) {
    return this.studentsService.findById(parent.studentId);
  }

  @Get('receivables')
  async myReceivables(@CurrentParent() parent: ParentAuthUser) {
    return this.receivablesService.findByStudent(parent.studentId);
  }

  /** Adds `eInvoice` only when the parent asked for an invoice on the order. */
  private async withEInvoice<T extends object>(
    target: T,
    order: Pick<PaymentOrder, 'id' | 'status' | 'invoiceEmail'>,
  ): Promise<T & { eInvoice?: ParentEInvoiceSummaryDto }> {
    const eInvoice = await this.einvoiceService.summaryForPaymentOrder(order);
    return eInvoice ? Object.assign(target, { eInvoice }) : target;
  }

  @Post('payment-orders')
  @ApiBody({
    type: CreateParentPaymentOrderDto,
    examples: {
      withoutInvoice: {
        summary: 'Không yêu cầu hóa đơn điện tử',
        value: {
          items: [{ receivableId: RECEIVABLE_EXAMPLE }],
          paymentMethod: 'VIETINBANK',
        },
      },
      withInvoice: {
        summary: 'Có yêu cầu xuất hóa đơn điện tử',
        description:
          'Hóa đơn được phát hành sau khi thanh toán được xác nhận và gửi tới invoice.email. Response có thêm eInvoice.',
        value: {
          items: [{ receivableId: RECEIVABLE_EXAMPLE }],
          paymentMethod: 'VIETINBANK',
          invoice: { email: 'phuhuynh@example.com' },
        },
      },
    },
  })
  async createPaymentOrder(
    @Body() dto: CreateParentPaymentOrderDto,
    @CurrentParent() parent: ParentAuthUser,
  ) {
    const order = await this.paymentOrdersService.create(
      {
        studentId: parent.studentId,
        items: dto.items,
        paymentMethod: this.qrMethodFor(dto.paymentMethod),
      },
      undefined,
      {
        invoiceEmail: dto.invoice?.email ?? null,
        ...(dto.clientRequestId
          ? { clientRequestId: dto.clientRequestId }
          : {}),
      },
    );
    return this.withEInvoice(order, order);
  }

  @Get('payment-orders/:id')
  async findPaymentOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentParent() parent: ParentAuthUser,
  ) {
    const order = await this.paymentOrdersService.findById(id);
    this.assertOwnsOrder(parent, order.studentId);
    return this.withEInvoice(order, order);
  }

  @Get('payment-orders/:id/qr')
  async getPaymentOrderQr(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentParent() parent: ParentAuthUser,
  ) {
    const order = await this.paymentOrdersService.findById(id);
    this.assertOwnsOrder(parent, order.studentId);
    const qr = await this.paymentOrdersService.getQr(id);
    // getQr may just have expired the order.
    return this.withEInvoice(qr, { ...order, status: qr.status });
  }
}
