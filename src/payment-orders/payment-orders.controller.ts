import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AccessControlService } from '../access-control/access-control.service';
import { StudentsService } from '../students/students.service';
import { PaymentOrdersService } from './payment-orders.service';
import { CreatePaymentOrderDto } from './dto/create-payment-order.dto';
import { PaymentMethod } from '../common/enums/status.enum';

@ApiTags('Payment Orders')
@ApiBearerAuth()
@Controller('payment-orders')
export class PaymentOrdersController {
  constructor(
    private readonly service: PaymentOrdersService,
    private readonly studentsService: StudentsService,
    private readonly accessControlService: AccessControlService,
  ) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT, Role.CASHIER)
  async create(
    @Body() dto: CreatePaymentOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    const student = await this.studentsService.findById(dto.studentId);
    await this.accessControlService.assertSchoolAccess(user, student.schoolId);
    // The staff UI still submits VIETQR for QR payments. Route those orders
    // through VietinBank's virtual-account generator as well, so no new QR
    // silently targets the school's main account.
    const paymentMethod =
      dto.paymentMethod === undefined ||
      dto.paymentMethod === PaymentMethod.VIETQR ||
      dto.paymentMethod === PaymentMethod.BANK_TRANSFER
        ? PaymentMethod.VIETINBANK
        : dto.paymentMethod;
    return this.service.create({ ...dto, paymentMethod }, user.id);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const order = await this.service.findById(id);
    await this.accessControlService.assertSchoolAccess(user, order.schoolId);
    return order;
  }

  @Get(':id/qr')
  async getQr(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const order = await this.service.findById(id);
    await this.accessControlService.assertSchoolAccess(user, order.schoolId);
    return this.service.getQr(id);
  }
}
