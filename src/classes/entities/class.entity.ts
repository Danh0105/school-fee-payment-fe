import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { ClassStatus } from '../../common/enums/status.enum';
import { School } from '../../schools/entities/school.entity';
import { AcademicYear } from '../../academic-years/entities/academic-year.entity';

@Entity('classes')
@Index(['schoolId', 'academicYearId', 'code'], { unique: true })
export class Class extends BaseEntity {
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

  @Column({ type: 'varchar', length: 20 })
  code: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  grade: string | null;

  @Column({ type: 'enum', enum: ClassStatus, default: ClassStatus.ACTIVE })
  status: ClassStatus;
}
