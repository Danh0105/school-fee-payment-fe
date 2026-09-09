import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { StudentDiscount } from './entities/student-discount.entity';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { ReceivablesService } from '../receivables/receivables.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { LedgerService } from '../ledger/ledger.service';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { DiscountType, LedgerEntryType } from '../common/enums/status.enum';

@Injectable()
export class DiscountsService {
  constructor(
    @InjectRepository(StudentDiscount)
    private readonly repo: Repository<StudentDiscount>,
    private readonly dataSource: DataSource,
    private readonly receivablesService: ReceivablesService,
    private readonly ledgerService: LedgerService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(
    receivableId: string,
    dto: CreateDiscountDto,
    actor: { userId: string; ipAddress?: string; userAgent?: string },
  ): Promise<StudentDiscount> {
    const value = new Decimal(dto.value);
    if (value.lte(0))
      throw AppException.badRequest(
        ErrorCode.DISCOUNT_INVALID,
        'Giá trị miễn giảm phải lớn hơn 0',
      );
    if (dto.type === DiscountType.PERCENTAGE && value.gt(100)) {
      throw AppException.badRequest(
        ErrorCode.DISCOUNT_INVALID,
        'Tỷ lệ phần trăm không được vượt quá 100',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const receivable = await this.receivablesService.findById(
        receivableId,
        manager,
      );

      const amount =
        dto.type === DiscountType.PERCENTAGE
          ? receivable.originalAmount
              .times(value)
              .dividedBy(100)
              .toDecimalPlaces(2)
          : value;

      if (
        amount.gt(receivable.originalAmount.minus(receivable.discountAmount))
      ) {
        throw AppException.badRequest(
          ErrorCode.DISCOUNT_INVALID,
          'Số tiền miễn giảm vượt quá số tiền gốc còn lại của khoản công nợ',
        );
      }

      const discountRepo = manager.getRepository(StudentDiscount);
      const discount = discountRepo.create({
        studentId: receivable.studentId,
        receivableId: receivable.id,
        type: dto.type,
        value,
        amount,
        reason: dto.reason,
        approvedBy: actor.userId,
        approvedAt: new Date(),
        createdBy: actor.userId,
      });
      const saved = await discountRepo.save(discount);

      await this.receivablesService.applyDiscountDelta(
        receivable.id,
        amount,
        manager,
      );

      await this.ledgerService.post(
        {
          schoolId: receivable.schoolId,
          studentId: receivable.studentId,
          entryType: LedgerEntryType.DISCOUNT,
          referenceType: 'StudentDiscount',
          referenceId: saved.id,
          creditAmount: amount,
          description: `Miễn giảm: ${dto.reason}`,
          createdBy: actor.userId,
        },
        manager,
      );

      await this.auditLogsService.record(
        {
          userId: actor.userId,
          action: 'APPLY_DISCOUNT',
          entityType: 'StudentReceivable',
          entityId: receivable.id,
          newData: {
            discountId: saved.id,
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

  async findByReceivable(receivableId: string): Promise<StudentDiscount[]> {
    return this.repo.find({
      where: { receivableId },
      order: { createdAt: 'DESC' },
    });
  }
}
