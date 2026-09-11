import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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

// @Public() skips the global staff JwtAuthGuard ('jwt' strategy); the
// controller-level ParentJwtAuthGuard below is what actually authenticates
// every route here against the separate 'jwt-parent' strategy. Every route
// only ever touches the single studentId embedded in the caller's token —
// there is no broader "parent account" to scope from.
@ApiTags('Parent Portal')
@ApiBearerAuth()
@Public()
@UseGuards(ParentJwtAuthGuard)
@Controller('parent')
export class ParentPortalController {
  constructor(
    private readonly studentsService: StudentsService,
    private readonly receivablesService: ReceivablesService,
    private readonly paymentOrdersService: PaymentOrdersService,
  ) {}

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

  @Post('payment-orders')
  async createPaymentOrder(
    @Body() dto: CreateParentPaymentOrderDto,
    @CurrentParent() parent: ParentAuthUser,
  ) {
    return this.paymentOrdersService.create({
      studentId: parent.studentId,
      items: dto.items,
      paymentMethod: dto.paymentMethod,
    });
  }

  @Get('payment-orders/:id')
  async findPaymentOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentParent() parent: ParentAuthUser,
  ) {
    const order = await this.paymentOrdersService.findById(id);
    this.assertOwnsOrder(parent, order.studentId);
    return order;
  }

  @Get('payment-orders/:id/qr')
  async getPaymentOrderQr(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentParent() parent: ParentAuthUser,
  ) {
    const order = await this.paymentOrdersService.findById(id);
    this.assertOwnsOrder(parent, order.studentId);
    return this.paymentOrdersService.getQr(id);
  }
}
