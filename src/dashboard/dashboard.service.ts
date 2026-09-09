import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { StudentReceivable } from '../receivables/entities/student-receivable.entity';
import { PaymentTransaction } from '../payment-transactions/entities/payment-transaction.entity';
import { Class } from '../classes/entities/class.entity';
import { FeeCategory } from '../fee-categories/entities/fee-category.entity';
import { StudentClass } from '../student-classes/entities/student-class.entity';
import { applySchoolScope } from '../common/utils/school-scope.util';
import {
  DashboardFilterDto,
  DashboardSeriesQueryDto,
} from './dto/dashboard-filter.dto';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(StudentReceivable)
    private readonly receivableRepo: Repository<StudentReceivable>,
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,
    @InjectRepository(Class)
    private readonly classRepo: Repository<Class>,
    @InjectRepository(FeeCategory)
    private readonly feeCategoryRepo: Repository<FeeCategory>,
  ) {}

  async summary(filter: DashboardFilterDto, scopedIds?: string[] | null) {
    const qb = this.receivableRepo.createQueryBuilder('r');
    const inScope = applySchoolScope(qb, 'r.schoolId', scopedIds ?? null);
    if (filter.schoolId)
      qb.andWhere('r.schoolId = :schoolId', { schoolId: filter.schoolId });
    if (filter.academicYearId)
      qb.andWhere('r.academicYearId = :ayId', { ayId: filter.academicYearId });

    const totals = inScope
      ? await qb
          .select('COALESCE(SUM(r.amountDue), 0)', 'totalReceivable')
          .addSelect('COALESCE(SUM(r.amountPaid), 0)', 'totalPaid')
          .addSelect(
            'COALESCE(SUM(r.amountOutstanding), 0)',
            'totalOutstanding',
          )
          .addSelect(
            `COUNT(*) FILTER (WHERE r.status = 'PAID')`,
            'studentsPaid',
          )
          .addSelect(
            `COUNT(*) FILTER (WHERE r.status = 'UNPAID' OR r.status = 'OVERDUE')`,
            'studentsUnpaid',
          )
          .addSelect(
            `COUNT(*) FILTER (WHERE r.status = 'PARTIALLY_PAID')`,
            'studentsPartial',
          )
          .getRawOne<Record<string, string>>()
      : undefined;

    const txQb = this.transactionRepo
      .createQueryBuilder('t')
      .where(`t.transactionTime >= date_trunc('day', now())`);
    const txInScope = applySchoolScope(txQb, 't.schoolId', scopedIds ?? null);
    if (filter.schoolId)
      txQb.andWhere('t.schoolId = :schoolId', { schoolId: filter.schoolId });
    const today = txInScope
      ? await txQb
          .select('COUNT(*)', 'transactionsToday')
          .addSelect('COALESCE(SUM(t.amount), 0)', 'amountToday')
          .getRawOne<{ transactionsToday: string; amountToday: string }>()
      : undefined;

    const totalReceivable = new Decimal(totals?.totalReceivable ?? 0);
    const totalPaid = new Decimal(totals?.totalPaid ?? 0);

    return {
      totalReceivable: totalReceivable.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
      totalOutstanding: new Decimal(totals?.totalOutstanding ?? 0).toFixed(2),
      collectionRate: totalReceivable.gt(0)
        ? totalPaid
            .dividedBy(totalReceivable)
            .times(100)
            .toDecimalPlaces(2)
            .toNumber()
        : 0,
      studentsPaid: Number(totals?.studentsPaid ?? 0),
      studentsUnpaid: Number(totals?.studentsUnpaid ?? 0),
      studentsPartial: Number(totals?.studentsPartial ?? 0),
      transactionsToday: Number(today?.transactionsToday ?? 0),
      amountToday: new Decimal(today?.amountToday ?? 0).toFixed(2),
    };
  }

  async revenueByDay(
    filter: DashboardSeriesQueryDto,
    scopedIds?: string[] | null,
  ) {
    const qb = this.transactionRepo
      .createQueryBuilder('t')
      .where(`t.transactionTime >= now() - (:days || ' days')::interval`, {
        days: filter.days ?? 30,
      });
    if (!applySchoolScope(qb, 't.schoolId', scopedIds ?? null)) return [];
    if (filter.schoolId)
      qb.andWhere('t.schoolId = :schoolId', { schoolId: filter.schoolId });

    const rows = await qb
      .select(`to_char(t.transactionTime, 'YYYY-MM-DD')`, 'date')
      .addSelect('COALESCE(SUM(t.amount), 0)', 'amount')
      .addSelect('COUNT(*)', 'transactions')
      .groupBy('date')
      .orderBy('date', 'ASC')
      .getRawMany<{ date: string; amount: string; transactions: string }>();

    return rows.map((r) => ({
      date: r.date,
      amount: new Decimal(r.amount).toFixed(2),
      transactions: Number(r.transactions),
    }));
  }

  async revenueByMonth(
    filter: DashboardSeriesQueryDto,
    scopedIds?: string[] | null,
  ) {
    const qb = this.transactionRepo
      .createQueryBuilder('t')
      .where(`t.transactionTime >= now() - (:months || ' months')::interval`, {
        months: filter.months ?? 12,
      });
    if (!applySchoolScope(qb, 't.schoolId', scopedIds ?? null)) return [];
    if (filter.schoolId)
      qb.andWhere('t.schoolId = :schoolId', { schoolId: filter.schoolId });

    const rows = await qb
      .select(`to_char(t.transactionTime, 'YYYY-MM')`, 'month')
      .addSelect('COALESCE(SUM(t.amount), 0)', 'amount')
      .addSelect('COUNT(*)', 'transactions')
      .groupBy('month')
      .orderBy('month', 'ASC')
      .getRawMany<{ month: string; amount: string; transactions: string }>();

    return rows.map((r) => ({
      month: r.month,
      amount: new Decimal(r.amount).toFixed(2),
      transactions: Number(r.transactions),
    }));
  }

  async byClass(filter: DashboardFilterDto, scopedIds?: string[] | null) {
    const classQb = this.classRepo.createQueryBuilder('c');
    if (!applySchoolScope(classQb, 'c.schoolId', scopedIds ?? null)) return [];
    if (filter.schoolId)
      classQb.andWhere('c.schoolId = :schoolId', { schoolId: filter.schoolId });
    if (filter.academicYearId)
      classQb.andWhere('c.academicYearId = :ayId', {
        ayId: filter.academicYearId,
      });
    const classes = await classQb.getMany();

    const results: {
      classId: string;
      className: string;
      totalDue: string;
      totalPaid: string;
      totalOutstanding: string;
      collectionRate: number;
    }[] = [];
    for (const klass of classes) {
      const row = await this.receivableRepo
        .createQueryBuilder('r')
        .innerJoin(
          StudentClass,
          'sc',
          'sc.studentId = r.studentId AND sc.classId = :classId AND sc.status = :active',
          {
            classId: klass.id,
            active: 'ACTIVE',
          },
        )
        .select('COALESCE(SUM(r.amountDue), 0)', 'totalDue')
        .addSelect('COALESCE(SUM(r.amountPaid), 0)', 'totalPaid')
        .addSelect('COALESCE(SUM(r.amountOutstanding), 0)', 'totalOutstanding')
        .getRawOne<{
          totalDue: string;
          totalPaid: string;
          totalOutstanding: string;
        }>();

      const totalDue = new Decimal(row?.totalDue ?? 0);
      const totalPaid = new Decimal(row?.totalPaid ?? 0);
      results.push({
        classId: klass.id,
        className: klass.name,
        totalDue: totalDue.toFixed(2),
        totalPaid: totalPaid.toFixed(2),
        totalOutstanding: new Decimal(row?.totalOutstanding ?? 0).toFixed(2),
        collectionRate: totalDue.gt(0)
          ? totalPaid
              .dividedBy(totalDue)
              .times(100)
              .toDecimalPlaces(2)
              .toNumber()
          : 0,
      });
    }
    return results;
  }

  async byFeeCategory(filter: DashboardFilterDto, scopedIds?: string[] | null) {
    const categoryQb = this.feeCategoryRepo
      .createQueryBuilder('fc')
      .where('fc.deletedAt IS NULL');
    if (!applySchoolScope(categoryQb, 'fc.schoolId', scopedIds ?? null))
      return [];
    if (filter.schoolId)
      categoryQb.andWhere('fc.schoolId = :schoolId', {
        schoolId: filter.schoolId,
      });
    const categories = await categoryQb.getMany();

    const results: {
      feeCategoryId: string;
      feeCategoryName: string;
      totalDue: string;
      totalPaid: string;
      totalOutstanding: string;
      collectionRate: number;
    }[] = [];
    for (const category of categories) {
      const row = await this.receivableRepo
        .createQueryBuilder('r')
        .innerJoin('r.feePlan', 'feePlan')
        .where('feePlan.feeCategoryId = :fcId', { fcId: category.id })
        .select('COALESCE(SUM(r.amountDue), 0)', 'totalDue')
        .addSelect('COALESCE(SUM(r.amountPaid), 0)', 'totalPaid')
        .addSelect('COALESCE(SUM(r.amountOutstanding), 0)', 'totalOutstanding')
        .getRawOne<{
          totalDue: string;
          totalPaid: string;
          totalOutstanding: string;
        }>();

      const totalDue = new Decimal(row?.totalDue ?? 0);
      const totalPaid = new Decimal(row?.totalPaid ?? 0);
      results.push({
        feeCategoryId: category.id,
        feeCategoryName: category.name,
        totalDue: totalDue.toFixed(2),
        totalPaid: totalPaid.toFixed(2),
        totalOutstanding: new Decimal(row?.totalOutstanding ?? 0).toFixed(2),
        collectionRate: totalDue.gt(0)
          ? totalPaid
              .dividedBy(totalDue)
              .times(100)
              .toDecimalPlaces(2)
              .toNumber()
          : 0,
      });
    }
    return results;
  }
}
