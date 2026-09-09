import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { PaymentOrder } from '../payment-orders/entities/payment-order.entity';
import { BankReconciliation } from '../reconciliation/entities/bank-reconciliation.entity';
import { PaymentProvidersService } from '../payment-providers/payment-providers.service';
import { PaymentAllocationsService } from '../payment-allocations/payment-allocations.service';
import { SchoolsService } from '../schools/schools.service';
import { PaginatedResult } from '../common/dto/paginated-result.dto';
import { QueryPaymentTransactionDto } from './dto/query-payment-transaction.dto';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import {
  PaymentOrderStatus,
  PaymentTransactionStatus,
  ReconciliationStatus,
} from '../common/enums/status.enum';

export interface IngestResult {
  duplicate: boolean;
  skipped: boolean;
  transactionId: string | null;
  matched: boolean;
}

@Injectable()
export class PaymentTransactionsService {
  private readonly logger = new Logger(PaymentTransactionsService.name);

  constructor(
    @InjectRepository(PaymentTransaction)
    private readonly repo: Repository<PaymentTransaction>,
    private readonly dataSource: DataSource,
    private readonly paymentProvidersService: PaymentProvidersService,
    private readonly paymentAllocationsService: PaymentAllocationsService,
    private readonly schoolsService: SchoolsService,
  ) {}

  async ingest(
    providerCode: string,
    rawBody: Record<string, unknown>,
    headers: Record<string, string | undefined>,
  ): Promise<IngestResult> {
    const provider = this.paymentProvidersService.get(providerCode);

    if (!provider.verifyWebhook(rawBody, headers)) {
      throw AppException.unauthorized(
        ErrorCode.UNAUTHORIZED,
        'Chữ ký webhook không hợp lệ',
      );
    }

    const parsed = provider.parseTransaction(rawBody);
    if (parsed.direction === 'out') {
      return {
        duplicate: false,
        skipped: true,
        transactionId: null,
        matched: false,
      };
    }

    return this.dataSource.transaction(async (manager) => {
      const transactionRepo = manager.getRepository(PaymentTransaction);
      const orderRepo = manager.getRepository(PaymentOrder);
      const reconciliationRepo = manager.getRepository(BankReconciliation);

      // Idempotent insert: a second delivery of the same (provider, externalTransactionId) is a no-op.
      const insertResult = await transactionRepo
        .createQueryBuilder()
        .insert()
        .into(PaymentTransaction)
        .values({
          schoolId: await this.resolveSchoolId(parsed, manager),
          provider: provider.code,
          externalTransactionId: parsed.externalTransactionId,
          bankTransactionId: parsed.bankTransactionId ?? null,
          bankCode: parsed.bankCode ?? null,
          bankAccountNumber: parsed.bankAccountNumber ?? null,
          amount: parsed.amount,
          transferContent: parsed.transferContent,
          transactionTime: parsed.transactionTime,
          rawPayload: parsed.rawPayload,
          status: PaymentTransactionStatus.RECEIVED,
        } as QueryDeepPartialEntity<PaymentTransaction>)
        .orIgnore()
        .execute();

      const insertedId = insertResult.identifiers[0]?.id as string | undefined;
      if (!insertedId) {
        const existing = await transactionRepo.findOne({
          where: {
            provider: provider.code,
            externalTransactionId: parsed.externalTransactionId,
          },
        });
        this.logger.warn(
          `Duplicate webhook ignored: ${provider.code}/${parsed.externalTransactionId}`,
        );
        return {
          duplicate: true,
          skipped: false,
          transactionId: existing?.id ?? null,
          matched: false,
        };
      }

      const transactionId = insertedId;
      const transaction = await transactionRepo.findOneOrFail({
        where: { id: transactionId },
      });

      const order = parsed.transferContent
        ? await orderRepo.findOne({
            where: { transferContent: parsed.transferContent.trim() },
            relations: { items: true },
          })
        : null;

      const matchable =
        order &&
        [
          PaymentOrderStatus.PENDING,
          PaymentOrderStatus.PARTIALLY_PAID,
        ].includes(order.status);

      if (matchable && order) {
        await reconciliationRepo.save(
          reconciliationRepo.create({
            paymentTransactionId: transaction.id,
            paymentOrderId: order.id,
            status: ReconciliationStatus.AUTO_MATCHED,
            matchedAt: new Date(),
          }),
        );
        await this.paymentAllocationsService.allocateToOrder(
          transaction,
          order,
          { userId: null },
          manager,
        );
        return {
          duplicate: false,
          skipped: false,
          transactionId: transaction.id,
          matched: true,
        };
      }

      transaction.status = PaymentTransactionStatus.UNMATCHED;
      await transactionRepo.save(transaction);
      await reconciliationRepo.save(
        reconciliationRepo.create({
          paymentTransactionId: transaction.id,
          paymentOrderId: null,
          status: ReconciliationStatus.UNMATCHED,
        }),
      );
      return {
        duplicate: false,
        skipped: false,
        transactionId: transaction.id,
        matched: false,
      };
    });
  }

  private async resolveSchoolId(
    parsed: {
      transferContent: string | null;
      bankAccountNumber?: string | null;
    },
    manager: EntityManager,
  ): Promise<string> {
    if (parsed.transferContent) {
      const order = await manager
        .getRepository(PaymentOrder)
        .findOne({ where: { transferContent: parsed.transferContent.trim() } });
      if (order) return order.schoolId;
    }
    if (parsed.bankAccountNumber) {
      const school = await this.schoolsService.findByBankAccountNumber(
        parsed.bankAccountNumber,
      );
      if (school) return school.id;
    }
    throw AppException.badRequest(
      ErrorCode.VALIDATION_ERROR,
      'Không thể xác định trường học cho giao dịch (transferContent/bankAccountNumber không khớp)',
    );
  }

  async findAll(
    query: QueryPaymentTransactionDto,
  ): Promise<PaginatedResult<PaymentTransaction>> {
    const qb = this.repo
      .createQueryBuilder('t')
      .orderBy(
        `t.${query.sortBy ?? 'transactionTime'}`,
        query.sortOrder ?? 'DESC',
      );
    if (query.schoolId)
      qb.andWhere('t.schoolId = :schoolId', { schoolId: query.schoolId });
    if (query.status)
      qb.andWhere('t.status = :status', { status: query.status });
    if (query.search) {
      qb.andWhere(
        '(t.transferContent ILIKE :search OR t.externalTransactionId ILIKE :search)',
        {
          search: `%${query.search}%`,
        },
      );
    }
    const [data, total] = await qb
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();
    return new PaginatedResult(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async findById(id: string): Promise<PaymentTransaction> {
    const transaction = await this.repo.findOne({ where: { id } });
    if (!transaction)
      throw AppException.notFound(ErrorCode.TRANSACTION_NOT_FOUND);
    return transaction;
  }
}
