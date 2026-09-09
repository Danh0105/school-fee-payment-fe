import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentOrder } from './entities/payment-order.entity';
import { PaymentOrderItem } from './entities/payment-order-item.entity';
import { PaymentOrdersService } from './payment-orders.service';
import { PaymentOrdersController } from './payment-orders.controller';
import { ReceivablesModule } from '../receivables/receivables.module';
import { SchoolsModule } from '../schools/schools.module';
import { StudentsModule } from '../students/students.module';
import { PaymentProvidersModule } from '../payment-providers/payment-providers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentOrder, PaymentOrderItem]),
    ReceivablesModule,
    SchoolsModule,
    StudentsModule,
    PaymentProvidersModule,
  ],
  providers: [PaymentOrdersService],
  controllers: [PaymentOrdersController],
  exports: [PaymentOrdersService],
})
export class PaymentOrdersModule {}
