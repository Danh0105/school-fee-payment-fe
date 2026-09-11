import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import Decimal from 'decimal.js';
import { BaseEntity } from '../../common/entities/base.entity';
import { ReceivableStatus } from '../../common/enums/status.enum';
import { decimalColumn } from '../../common/utils/decimal.transformer';
import { School } from '../../schools/entities/school.entity';
import { Student } from '../../students/entities/student.entity';
import { AcademicYear } from '../../academic-years/entities/academic-year.entity';
import { Semester } from '../../semesters/entities/semester.entity';
import { FeePlan } from '../../fee-plans/entities/fee-plan.entity';

// Unique on (studentId, feePlanId, semesterId) — with NULL semesterId
// coalesced to a fixed sentinel so ONE_TIME plans still get exactly one
// receivable per student. See migration SplitReceivablesBySemester.
@Entity('student_receivables')
export class StudentReceivable extends BaseEntity {
  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ type: 'uuid' })
  studentId: string;

  @ManyToOne(() => Student, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @Column({ type: 'uuid' })
  academicYearId: string;

  @ManyToOne(() => AcademicYear, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: AcademicYear;

  @Column({ type: 'uuid', nullable: true })
  semesterId: string | null;

  @ManyToOne(() => Semester, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'semester_id' })
  semester: Semester | null;

  @Index()
  @Column({ type: 'uuid' })
  feePlanId: string;

  @ManyToOne(() => FeePlan, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'fee_plan_id' })
  feePlan: FeePlan;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50 })
  receivableCode: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Column({ ...decimalColumn(), precision: 10, scale: 2 })
  quantity: Decimal;

  @Column(decimalColumn())
  unitPrice: Decimal;

  @Column(decimalColumn())
  originalAmount: Decimal;

  @Column(decimalColumn({ default: '0' }))
  discountAmount: Decimal;

  @Column(decimalColumn({ default: '0' }))
  adjustmentAmount: Decimal;

  @Column(decimalColumn())
  amountDue: Decimal;

  @Column(decimalColumn({ default: '0' }))
  amountPaid: Decimal;

  @Column(decimalColumn())
  amountOutstanding: Decimal;

  @Index()
  @Column({ type: 'date', nullable: true })
  dueDate: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: ReceivableStatus,
    default: ReceivableStatus.UNPAID,
  })
  status: ReceivableStatus;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;
}
