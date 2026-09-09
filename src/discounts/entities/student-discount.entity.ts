import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import Decimal from 'decimal.js';
import { BaseEntityNoUpdate } from '../../common/entities/base.entity';
import { DiscountType } from '../../common/enums/status.enum';
import { decimalColumn } from '../../common/utils/decimal.transformer';
import { Student } from '../../students/entities/student.entity';
import { StudentReceivable } from '../../receivables/entities/student-receivable.entity';

@Entity('student_discounts')
export class StudentDiscount extends BaseEntityNoUpdate {
  @Column({ type: 'uuid' })
  studentId: string;

  @ManyToOne(() => Student, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @Column({ type: 'uuid' })
  receivableId: string;

  @ManyToOne(() => StudentReceivable, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'receivable_id' })
  receivable: StudentReceivable;

  @Column({ type: 'enum', enum: DiscountType })
  type: DiscountType;

  @Column(decimalColumn())
  value: Decimal;

  @Column(decimalColumn())
  amount: Decimal;

  @Column({ type: 'varchar', length: 500 })
  reason: string;

  @Column({ type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;
}
