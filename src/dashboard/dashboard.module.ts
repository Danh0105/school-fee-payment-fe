import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentReceivable } from '../receivables/entities/student-receivable.entity';
import { PaymentTransaction } from '../payment-transactions/entities/payment-transaction.entity';
import { Class } from '../classes/entities/class.entity';
import { FeeCategory } from '../fee-categories/entities/fee-category.entity';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StudentReceivable,
      PaymentTransaction,
      Class,
      FeeCategory,
    ]),
  ],
  providers: [DashboardService],
  controllers: [DashboardController],
})
export class DashboardModule {}
