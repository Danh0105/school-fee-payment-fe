import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import Decimal from 'decimal.js';
import { LedgerService } from './ledger.service';

@ApiTags('Students')
@ApiBearerAuth()
@Controller('students/:id/ledger')
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Get()
  async getLedger(@Param('id', ParseUUIDPipe) studentId: string) {
    const entries = await this.ledgerService.findByStudent(studentId);
    let balance = new Decimal(0);
    const rows = entries.map((e) => {
      balance = balance.plus(e.debitAmount).minus(e.creditAmount);
      return {
        id: e.id,
        postingDate: e.postingDate,
        entryType: e.entryType,
        description: e.description,
        referenceType: e.referenceType,
        referenceId: e.referenceId,
        debitAmount: e.debitAmount.toFixed(2),
        creditAmount: e.creditAmount.toFixed(2),
        balance: balance.toFixed(2),
      };
    });
    return { studentId, entries: rows, closingBalance: balance.toFixed(2) };
  }
}
