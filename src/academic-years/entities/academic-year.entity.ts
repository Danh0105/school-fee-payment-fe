import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { AcademicYearStatus } from '../../common/enums/status.enum';
import { School } from '../../schools/entities/school.entity';

@Entity('academic_years')
@Index(['schoolId', 'name'], { unique: true })
export class AcademicYear extends BaseEntity {
  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ type: 'varchar', length: 50 })
  name: string;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;

  @Column({
    type: 'enum',
    enum: AcademicYearStatus,
    default: AcademicYearStatus.DRAFT,
  })
  status: AcademicYearStatus;
}
