import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import Decimal from 'decimal.js';
import { StudentReceivable } from '../receivables/entities/student-receivable.entity';
import { ReceivableAdjustment } from '../adjustments/entities/receivable-adjustment.entity';
import { PaymentTransaction } from '../payment-transactions/entities/payment-transaction.entity';
import { Class } from '../classes/entities/class.entity';
import { StudentClass } from '../student-classes/entities/student-class.entity';
import { ReportFilterDto } from './dto/report-filter.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResult } from '../common/dto/paginated-result.dto';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import {
  AdjustmentStatus,
  ReceivableStatus,
} from '../common/enums/status.enum';

export interface ReceivablesReport {
  totalReceivable: string;
  totalDiscount: string;
  totalAdjustmentIncrease: string;
  totalAdjustmentDecrease: string;
  totalDue: string;
  totalPaid: string;
  totalOutstanding: string;
  studentsPaid: number;
  studentsUnpaid: number;
  studentsPartial: number;
  collectionRate: number;
}

export interface ClassReportRow {
  studentId: string;
  studentCode: string;
  fullName: string;
  amountDue: string;
  amountPaid: string;
  amountOutstanding: string;
  status: ReceivableStatus;
}

export interface ClassReport {
  classId: string;
  className: string;
  studentCount: number;
  totalDue: string;
  totalPaid: string;
  totalOutstanding: string;
  collectionRate: number;
  students: ClassReportRow[];
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(StudentReceivable)
    private readonly receivableRepo: Repository<StudentReceivable>,
    @InjectRepository(ReceivableAdjustment)
    private readonly adjustmentRepo: Repository<ReceivableAdjustment>,
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,
    @InjectRepository(Class)
    private readonly classRepo: Repository<Class>,
  ) {}

  private applyFilters(
    qb: SelectQueryBuilder<StudentReceivable>,
    filter: ReportFilterDto,
  ): void {
    if (filter.schoolId)
      qb.andWhere('r.schoolId = :schoolId', { schoolId: filter.schoolId });
    if (filter.academicYearId)
      qb.andWhere('r.academicYearId = :ayId', { ayId: filter.academicYearId });
    if (filter.semesterId)
      qb.andWhere('r.semesterId = :semId', { semId: filter.semesterId });
    if (filter.studentId)
      qb.andWhere('r.studentId = :studentId', { studentId: filter.studentId });
    if (filter.status)
      qb.andWhere('r.status = :status', { status: filter.status });
    if (filter.fromDate)
      qb.andWhere('r.createdAt >= :fromDate', { fromDate: filter.fromDate });
    if (filter.toDate)
      qb.andWhere('r.createdAt <= :toDate', { toDate: filter.toDate });
    if (filter.feeCategoryId) {
      qb.innerJoin('r.feePlan', 'feePlan').andWhere(
        'feePlan.feeCategoryId = :fcId',
        { fcId: filter.feeCategoryId },
      );
    }
    if (filter.classId) {
      qb.andWhere(
        (subQb) =>
          `r.studentId IN ${subQb
            .subQuery()
            .select('sc.studentId')
            .from(StudentClass, 'sc')
            .where('sc.classId = :classId')
            .andWhere("sc.status = 'ACTIVE'")
            .getQuery()}`,
      ).setParameter('classId', filter.classId);
    }
  }

  async receivablesReport(filter: ReportFilterDto): Promise<ReceivablesReport> {
    const qb = this.receivableRepo.createQueryBuilder('r');
    this.applyFilters(qb, filter);

    const totals = await qb
      .select('COALESCE(SUM(r.originalAmount), 0)', 'totalReceivable')
      .addSelect('COALESCE(SUM(r.discountAmount), 0)', 'totalDiscount')
      .addSelect('COALESCE(SUM(r.amountDue), 0)', 'totalDue')
      .addSelect('COALESCE(SUM(r.amountPaid), 0)', 'totalPaid')
      .addSelect('COALESCE(SUM(r.amountOutstanding), 0)', 'totalOutstanding')
      .addSelect(`COUNT(*) FILTER (WHERE r.status = 'PAID')`, 'studentsPaid')
      .addSelect(
        `COUNT(*) FILTER (WHERE r.status = 'UNPAID' OR r.status = 'OVERDUE')`,
        'studentsUnpaid',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE r.status = 'PARTIALLY_PAID')`,
        'studentsPartial',
      )
      .getRawOne<Record<string, string>>();

    const receivableIdsQb = this.receivableRepo
      .createQueryBuilder('r')
      .select('r.id');
    this.applyFilters(receivableIdsQb, filter);

    const adjustmentTotals = await this.adjustmentRepo
      .createQueryBuilder('a')
      .select(
        `COALESCE(SUM(a.amount) FILTER (WHERE a.type = 'INCREASE'), 0)`,
        'increase',
      )
      .addSelect(
        `COALESCE(SUM(a.amount) FILTER (WHERE a.type = 'DECREASE'), 0)`,
        'decrease',
      )
      .where(`a.status = :approved`, { approved: AdjustmentStatus.APPROVED })
      .andWhere(`a.receivableId IN (${receivableIdsQb.getQuery()})`)
      .setParameters(receivableIdsQb.getParameters())
      .getRawOne<{ increase: string; decrease: string }>();

    const totalDue = new Decimal(totals?.totalDue ?? 0);
    const totalReceivable = new Decimal(totals?.totalReceivable ?? 0);
    const totalPaid = new Decimal(totals?.totalPaid ?? 0);
    const collectionRate = totalDue.gt(0)
      ? totalPaid.dividedBy(totalDue).times(100).toDecimalPlaces(2).toNumber()
      : 0;

    return {
      totalReceivable: totalReceivable.toFixed(2),
      totalDiscount: new Decimal(totals?.totalDiscount ?? 0).toFixed(2),
      totalAdjustmentIncrease: new Decimal(
        adjustmentTotals?.increase ?? 0,
      ).toFixed(2),
      totalAdjustmentDecrease: new Decimal(
        adjustmentTotals?.decrease ?? 0,
      ).toFixed(2),
      totalDue: totalDue.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
      totalOutstanding: new Decimal(totals?.totalOutstanding ?? 0).toFixed(2),
      studentsPaid: Number(totals?.studentsPaid ?? 0),
      studentsUnpaid: Number(totals?.studentsUnpaid ?? 0),
      studentsPartial: Number(totals?.studentsPartial ?? 0),
      collectionRate,
    };
  }

  async paymentsReport(filter: ReportFilterDto): Promise<{
    totalAmount: string;
    transactionCount: number;
  }> {
    const qb = this.transactionRepo.createQueryBuilder('t');
    if (filter.schoolId)
      qb.andWhere('t.schoolId = :schoolId', { schoolId: filter.schoolId });
    if (filter.fromDate)
      qb.andWhere('t.transactionTime >= :fromDate', {
        fromDate: filter.fromDate,
      });
    if (filter.toDate)
      qb.andWhere('t.transactionTime <= :toDate', { toDate: filter.toDate });

    const raw = await qb
      .select('COALESCE(SUM(t.amount), 0)', 'totalAmount')
      .addSelect('COUNT(*)', 'transactionCount')
      .getRawOne<{ totalAmount: string; transactionCount: string }>();

    return {
      totalAmount: new Decimal(raw?.totalAmount ?? 0).toFixed(2),
      transactionCount: Number(raw?.transactionCount ?? 0),
    };
  }

  async classReport(classId: string): Promise<ClassReport> {
    const klass = await this.classRepo.findOne({ where: { id: classId } });
    if (!klass) throw AppException.notFound(ErrorCode.CLASS_NOT_FOUND);

    const rows = await this.receivableRepo
      .createQueryBuilder('r')
      .innerJoin('r.student', 'student')
      .innerJoin(
        StudentClass,
        'sc',
        'sc.studentId = student.id AND sc.classId = :classId AND sc.status = :active',
        {
          classId,
          active: 'ACTIVE',
        },
      )
      .select('student.id', 'studentId')
      .addSelect('student.studentCode', 'studentCode')
      .addSelect('student.fullName', 'fullName')
      .addSelect('r.amountDue', 'amountDue')
      .addSelect('r.amountPaid', 'amountPaid')
      .addSelect('r.amountOutstanding', 'amountOutstanding')
      .addSelect('r.status', 'status')
      .getRawMany<{
        studentId: string;
        studentCode: string;
        fullName: string;
        amountDue: string;
        amountPaid: string;
        amountOutstanding: string;
        status: ReceivableStatus;
      }>();

    let totalDue = new Decimal(0);
    let totalPaid = new Decimal(0);
    let totalOutstanding = new Decimal(0);
    const students: ClassReportRow[] = rows.map((r) => {
      totalDue = totalDue.plus(r.amountDue);
      totalPaid = totalPaid.plus(r.amountPaid);
      totalOutstanding = totalOutstanding.plus(r.amountOutstanding);
      return {
        studentId: r.studentId,
        studentCode: r.studentCode,
        fullName: r.fullName,
        amountDue: new Decimal(r.amountDue).toFixed(2),
        amountPaid: new Decimal(r.amountPaid).toFixed(2),
        amountOutstanding: new Decimal(r.amountOutstanding).toFixed(2),
        status: r.status,
      };
    });

    const studentCountRow = await this.classRepo
      .createQueryBuilder('c')
      .innerJoin(
        StudentClass,
        'sc',
        'sc.classId = c.id AND sc.status = :active',
        { active: 'ACTIVE' },
      )
      .where('c.id = :classId', { classId })
      .select('COUNT(DISTINCT sc.studentId)', 'count')
      .getRawOne<{ count: string }>();

    return {
      classId: klass.id,
      className: klass.name,
      studentCount: Number(studentCountRow?.count ?? students.length),
      totalDue: totalDue.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
      totalOutstanding: totalOutstanding.toFixed(2),
      collectionRate: totalDue.gt(0)
        ? totalPaid.dividedBy(totalDue).times(100).toDecimalPlaces(2).toNumber()
        : 0,
      students,
    };
  }

  async listReceivableRows(
    filter: ReportFilterDto,
    pagination: PaginationQueryDto,
  ): Promise<PaginatedResult<StudentReceivable>> {
    const qb = this.receivableRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.student', 'student')
      .leftJoinAndSelect('r.feePlan', 'feePlan')
      .orderBy('r.createdAt', 'DESC');
    this.applyFilters(qb, filter);

    const [data, total] = await qb
      .skip(pagination.skip)
      .take(pagination.limit ?? 20)
      .getManyAndCount();
    return new PaginatedResult(
      data,
      total,
      pagination.page ?? 1,
      pagination.limit ?? 20,
    );
  }
}
