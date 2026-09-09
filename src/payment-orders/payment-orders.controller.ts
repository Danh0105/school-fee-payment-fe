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
import { PaymentOrdersService } from './payment-orders.service';
import { CreatePaymentOrderDto } from './dto/create-payment-order.dto';

@ApiTags('Payment Orders')
@ApiBearerAuth()
@Controller('payment-orders')
export class PaymentOrdersController {
  constructor(private readonly service: PaymentOrdersService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT, Role.CASHIER)
  create(
    @Body() dto: CreatePaymentOrderDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.create(dto, userId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id);
  }

  @Get(':id/qr')
  getQr(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getQr(id);
  }
}
