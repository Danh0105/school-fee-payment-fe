import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { ReceivableAdjustment } from './entities/receivable-adjustment.entity';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { ReceivablesService } from '../receivables/receivables.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { LedgerService } from '../ledger/ledger.service';
import { SequenceService } from '../database/sequence.service';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import {
  AdjustmentStatus,
  AdjustmentType,
  LedgerEntryType,
} from '../common/enums/status.enum';

@Injectable()
export class AdjustmentsService {
  constructor(
    @InjectRepository(ReceivableAdjustment)
    private readonly repo: Repository<ReceivableAdjustment>,
    private readonly dataSource: DataSource,
    private readonly receivablesService: ReceivablesService,
    private readonly ledgerService: LedgerService,
    private readonly sequenceService: SequenceService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(
    receivableId: string,
    dto: CreateAdjustmentDto,
    actor: { userId: string; ipAddress?: string; userAgent?: string },
  ): Promise<ReceivableAdjustment> {
    const amount = new Decimal(dto.amount);
    if (amount.lte(0)) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_ERROR,
        'Số tiền điều chỉnh phải lớn hơn 0',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const receivable = await this.receivablesService.findById(
        receivableId,
        manager,
      );

      const adjustmentCode = await this.sequenceService.generateCode(
        'ADJ',
        `ADJUSTMENT:${receivable.schoolId}`,
        8,
        manager,
      );

      const adjRepo = manager.getRepository(ReceivableAdjustment);
      const adjustment = adjRepo.create({
        receivableId: receivable.id,
        adjustmentCode,
        type: dto.type,
        amount,
        reason: dto.reason,
        status: AdjustmentStatus.APPROVED,
        createdBy: actor.userId,
        approvedBy: actor.userId,
        approvedAt: new Date(),
      });
      const saved = await adjRepo.save(adjustment);

      const signedDelta =
        dto.type === AdjustmentType.INCREASE ? amount : amount.negated();
      await this.receivablesService.applyAdjustmentDelta(
        receivable.id,
        signedDelta,
        manager,
      );

      await this.ledgerService.post(
        {
          schoolId: receivable.schoolId,
          studentId: receivable.studentId,
          entryType:
            dto.type === AdjustmentType.INCREASE
              ? LedgerEntryType.ADJUSTMENT_INCREASE
              : LedgerEntryType.ADJUSTMENT_DECREASE,
          referenceType: 'ReceivableAdjustment',
          referenceId: saved.id,
          debitAmount:
            dto.type === AdjustmentType.INCREASE ? amount : new Decimal(0),
          creditAmount:
            dto.type === AdjustmentType.DECREASE ? amount : new Decimal(0),
          description: `Điều chỉnh công nợ (${adjustmentCode}): ${dto.reason}`,
          createdBy: actor.userId,
        },
        manager,
      );

      await this.auditLogsService.record(
        {
          userId: actor.userId,
          action: 'ADJUST_RECEIVABLE',
          entityType: 'StudentReceivable',
          entityId: receivable.id,
          newData: {
            adjustmentId: saved.id,
            amount: amount.toFixed(2),
            type: dto.type,
          },
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        },
        manager,
      );

      return saved;
    });
  }

  async findByReceivable(
    receivableId: string,
  ): Promise<ReceivableAdjustment[]> {
    return this.repo.find({
      where: { receivableId },
      order: { createdAt: 'DESC' },
    });
  }
}
