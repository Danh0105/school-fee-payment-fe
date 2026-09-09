import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import Decimal from 'decimal.js';
import { BaseEntity } from '../../common/entities/base.entity';
import { BillingType, FeePlanStatus } from '../../common/enums/status.enum';
import { decimalColumn } from '../../common/utils/decimal.transformer';
import { School } from '../../schools/entities/school.entity';
import { AcademicYear } from '../../academic-years/entities/academic-year.entity';
import { Semester } from '../../semesters/entities/semester.entity';
import { FeeCategory } from '../../fee-categories/entities/fee-category.entity';

@Entity('fee_plans')
@Index(['schoolId', 'academicYearId', 'code'], { unique: true })
export class FeePlan extends BaseEntity {
  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ type: 'uuid' })
  academicYearId: string;

  @ManyToOne(() => AcademicYear, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: AcademicYear;

  @Column({ type: 'uuid', nullable: true })
  semesterId: string | null;

  @ManyToOne(() => Semester, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'semester_id' })
  semester: Semester | null;

  @Column({ type: 'uuid' })
  feeCategoryId: string;

  @ManyToOne(() => FeeCategory, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'fee_category_id' })
  feeCategory: FeeCategory;

  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: BillingType, default: BillingType.ONE_TIME })
  billingType: BillingType;

  @Column(decimalColumn())
  unitPrice: Decimal;

  @Column({ ...decimalColumn(), precision: 10, scale: 2, default: '1' })
  quantity: Decimal;

  @Column(decimalColumn())
  defaultAmount: Decimal;

  @Column({ type: 'date', nullable: true })
  startDate: string | null;

  @Column({ type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ type: 'enum', enum: FeePlanStatus, default: FeePlanStatus.DRAFT })
  status: FeePlanStatus;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;
}
