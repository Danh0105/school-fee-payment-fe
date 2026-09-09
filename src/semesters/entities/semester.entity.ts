import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { SemesterStatus } from '../../common/enums/status.enum';
import { AcademicYear } from '../../academic-years/entities/academic-year.entity';

@Entity('semesters')
@Index(['academicYearId', 'code'], { unique: true })
export class Semester extends BaseEntity {
  @Column({ type: 'uuid' })
  academicYearId: string;

  @ManyToOne(() => AcademicYear, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: AcademicYear;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  code: string;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;

  @Column({ type: 'enum', enum: SemesterStatus, default: SemesterStatus.DRAFT })
  status: SemesterStatus;
}
