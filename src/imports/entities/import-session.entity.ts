import { Column, Entity } from 'typeorm';
import { BaseEntityNoUpdate } from '../../common/entities/base.entity';
import {
  AcademicYearStatus,
  EntityStatus,
  StudentStatus,
} from '../../common/enums/status.enum';
import { Gender } from '../../students/entities/student.entity';

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
  dateOfBirth: string | null;
  gender: Gender | null;
  address: string | null;
  phone: string | null;
  parentName: string | null;
  parentPhone: string | null;
  parentEmail: string | null;
  status: StudentStatus;
  classCode: string;
  className: string;
  classGrade: string | null;
  quantity: string;
  unitPrice: string;
  originalAmount: string;
  legacyTransferContent: string | null;
  serviceName: string | null;
}

export interface ImportBootstrapContext {
  createSchool: boolean;
  createAcademicYear: boolean;
  companyId: string | null;
  school: {
    code: string;
    name: string;
    address: string | null;
    phone: string | null;
    taxCode: string | null;
    managerInfo: string | null;
    salesRepresentative: string | null;
    bankName: string | null;
    bankCode: string | null;
    bankAccountNumber: string | null;
    bankAccountName: string | null;
    status: EntityStatus;
  };
  academicYear: {
    name: string;
    startDate: string;
    endDate: string;
    status: AcademicYearStatus;
  };
}

/** Choices for a payment-list import ("danh sách thu" with amounts). */
export interface ImportPaymentOptions {
  /** On confirm, create a receivable and a payment order per row. */
  createPaymentOrders: boolean;
  /** YYYY-MM-DD the orders and their QR expire at; null = no expiry. */
  qrExpiresAt: string | null;
  /** Text above the header row, used as the list's fee plan name. */
  title: string | null;
  /** What the debts are for, printed on receipts and e-invoices. */
  serviceName?: string | null;
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

  @Column({ type: 'jsonb', nullable: true })
  bootstrapContext: ImportBootstrapContext | null;

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

  @Column({ type: 'jsonb', nullable: true })
  paymentOptions: ImportPaymentOptions | null;
}
