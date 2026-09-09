import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentReceivable } from './entities/student-receivable.entity';
import { ReceivablesService } from './receivables.service';
import { ReceivablesController } from './receivables.controller';
import { StudentReceivablesController } from './student-receivables.controller';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [TypeOrmModule.forFeature([StudentReceivable]), LedgerModule],
  providers: [ReceivablesService],
  controllers: [ReceivablesController, StudentReceivablesController],
  exports: [ReceivablesService],
})
export class ReceivablesModule {}
