import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentAllocation } from './entities/payment-allocation.entity';
import { PaymentAllocationsService } from './payment-allocations.service';
import { ReceivablesModule } from '../receivables/receivables.module';
import { LedgerModule } from '../ledger/ledger.module';
import { ReceiptsModule } from '../receipts/receipts.module';
import { StudentCreditsModule } from '../student-credits/student-credits.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentAllocation]),
    ReceivablesModule,
    LedgerModule,
    ReceiptsModule,
    StudentCreditsModule,
  ],
  providers: [PaymentAllocationsService],
  exports: [PaymentAllocationsService],
})
export class PaymentAllocationsModule {}
