import { Column, Entity } from 'typeorm';
import { BaseEntityNoUpdate } from '../../common/entities/base.entity';

export enum ImportSessionType {
  STUDENTS = 'STUDENTS',
  RECEIVABLES = 'RECEIVABLES',
  COMBINED = 'COMBINED',
}

export enum ImportSessionStatus {
  PENDING_CONFIRMATION = 'PENDING_CONFIRMATION',
  CONFIRMED = 'CONFIRMED',
  EXPIRED = 'EXPIRED',
}

export interface ImportRowError {
  sheet: string;
  row: number;
  column: string;
  field: string;
  value: unknown;
  message: string;
}

export interface ParsedImportRow {
  rowNumber: number;
  studentCode: string | null;
  identifierCode: string | null;
  fullName: string;
  address: string | null;
  phone: string | null;
  classCode: string;
  quantity: string;
  unitPrice: string;
  originalAmount: string;
  legacyTransferContent: string | null;
  serviceName: string | null;
}

@Entity('import_sessions')
export class ImportSession extends BaseEntityNoUpdate {
  @Column({ type: 'uuid' })
  schoolId: string;

  @Column({ type: 'uuid' })
  academicYearId: string;

  @Column({ type: 'uuid', nullable: true })
  feePlanId: string | null;

  @Column({ type: 'enum', enum: ImportSessionType })
  type: ImportSessionType;

  @Column({ type: 'varchar', length: 255 })
  fileName: string;

  @Column({ type: 'int' })
  totalRows: number;

  @Column({ type: 'int' })
  validRowCount: number;

  @Column({ type: 'int' })
  invalidRowCount: number;

  @Column({ type: 'jsonb' })
  validRows: ParsedImportRow[];

  @Column({ type: 'jsonb' })
  errors: ImportRowError[];

  @Column({
    type: 'enum',
    enum: ImportSessionStatus,
    default: ImportSessionStatus.PENDING_CONFIRMATION,
  })
  status: ImportSessionStatus;

  @Column({ type: 'uuid' })
  createdBy: string;

  @Column({ type: 'jsonb', nullable: true })
  confirmResult: Record<string, unknown> | null;
}
