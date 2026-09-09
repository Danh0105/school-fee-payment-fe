import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentLedgerEntry } from './entities/student-ledger-entry.entity';
import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';
import { StudentsModule } from '../students/students.module';

@Module({
  imports: [TypeOrmModule.forFeature([StudentLedgerEntry]), StudentsModule],
  providers: [LedgerService],
  controllers: [LedgerController],
  exports: [LedgerService],
})
export class LedgerModule {}
