import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AccessControlService } from '../access-control/access-control.service';
import { PaymentOrdersService } from '../payment-orders/payment-orders.service';
import { PaymentNotificationsService } from './payment-notifications.service';

@ApiTags('Payment Orders')
@ApiBearerAuth()
@Controller('payment-orders/:id')
export class NotificationsController {
  constructor(
    private readonly service: PaymentNotificationsService,
    private readonly paymentOrdersService: PaymentOrdersService,
    private readonly accessControlService: AccessControlService,
  ) {}

  @Post('notify-parent')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT, Role.CASHIER)
  async notifyParent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const order = await this.paymentOrdersService.findById(id);
    await this.accessControlService.assertSchoolAccess(user, order.schoolId);
    return this.service.notifyParentForOrder(id, { userId: user.id });
  }

  @Get('notifications')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT, Role.CASHIER)
  async listNotifications(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const order = await this.paymentOrdersService.findById(id);
    await this.accessControlService.assertSchoolAccess(user, order.schoolId);
    return this.service.findLogsByReference('PaymentOrder', id);
  }
}
