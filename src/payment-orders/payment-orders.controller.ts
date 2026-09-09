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
    return this.service.create(dto, user.id);
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
