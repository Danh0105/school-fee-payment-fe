import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentDiscount } from './entities/student-discount.entity';
import { DiscountsService } from './discounts.service';
import { DiscountsController } from './discounts.controller';
import { ReceivablesModule } from '../receivables/receivables.module';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([StudentDiscount]),
    ReceivablesModule,
    LedgerModule,
  ],
  providers: [DiscountsService],
  controllers: [DiscountsController],
  exports: [DiscountsService],
})
export class DiscountsModule {}
