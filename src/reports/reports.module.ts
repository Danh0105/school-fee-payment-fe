import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentReceivable } from '../receivables/entities/student-receivable.entity';
import { ReceivableAdjustment } from '../adjustments/entities/receivable-adjustment.entity';
import { PaymentTransaction } from '../payment-transactions/entities/payment-transaction.entity';
import { Class } from '../classes/entities/class.entity';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StudentReceivable,
      ReceivableAdjustment,
      PaymentTransaction,
      Class,
    ]),
  ],
  providers: [ReportsService],
  controllers: [ReportsController],
  exports: [ReportsService],
})
export class ReportsModule {}
