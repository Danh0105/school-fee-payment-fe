import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankReconciliation } from './entities/bank-reconciliation.entity';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationController } from './reconciliation.controller';
import { PaymentAllocationsModule } from '../payment-allocations/payment-allocations.module';
import { ReceiptsModule } from '../receipts/receipts.module';
import { StudentCreditsModule } from '../student-credits/student-credits.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([BankReconciliation]),
    PaymentAllocationsModule,
    ReceiptsModule,
    StudentCreditsModule,
  ],
  providers: [ReconciliationService],
  controllers: [ReconciliationController],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
