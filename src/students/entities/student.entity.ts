import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { StudentStatus } from '../../common/enums/status.enum';
import { School } from '../../schools/entities/school.entity';

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
}

@Entity('students')
@Index(['schoolId', 'studentCode'], { unique: true })
// Unique per school, not globally — a school's identifierCode duplicate
// must never block onboarding students at a different, unrelated school.
// Nullable-safe: Postgres doesn't treat two NULLs as a duplicate, so
// students without an identifierCode yet (not entered/imported) never
// collide with each other. See migration UniqueStudentIdentifierCode.
@Index(['schoolId', 'identifierCode'], { unique: true })
export class Student extends BaseEntity {
  @Column({ type: 'uuid' })
  schoolId: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'school_id' })
  school: School;

  @Column({ type: 'varchar', length: 50 })
  studentCode: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  identifierCode: string | null;

  @Column({ type: 'varchar', length: 255 })
  fullName: string;

  @Column({ type: 'date', nullable: true })
  dateOfBirth: string | null;

  @Column({ type: 'enum', enum: Gender, nullable: true })
  gender: Gender | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  parentName: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  parentPhone: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  parentEmail: string | null;

  @Column({ type: 'enum', enum: StudentStatus, default: StudentStatus.ACTIVE })
  status: StudentStatus;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
