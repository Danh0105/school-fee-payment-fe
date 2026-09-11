import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { RawImportRow } from './excel-parser.service';
import {
  ImportRowError,
  ImportSessionType,
  ParsedImportRow,
} from './entities/import-session.entity';
import { Class } from '../classes/entities/class.entity';
import { Student } from '../students/entities/student.entity';
import { StudentReceivable } from '../receivables/entities/student-receivable.entity';

export interface ValidateParams {
  type: ImportSessionType;
  schoolId: string;
  feePlanId?: string;
}

export interface ValidationResult {
  validRows: ParsedImportRow[];
  errors: ImportRowError[];
}

@Injectable()
export class ImportValidationService {
  constructor(
    @InjectRepository(Class)
    private readonly classRepository: Repository<Class>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(StudentReceivable)
    private readonly receivableRepository: Repository<StudentReceivable>,
  ) {}

  async validate(
    rows: RawImportRow[],
    params: ValidateParams,
    academicYearId: string,
  ): Promise<ValidationResult> {
    const errors: ImportRowError[] = [];
    const validRows: ParsedImportRow[] = [];

    const classCodes = [
      ...new Set(rows.map((r) => r.values.classCode).filter(Boolean)),
    ];
    const classes = classCodes.length
      ? await this.classRepository.find({
          where: {
            schoolId: params.schoolId,
            academicYearId,
            code: In(classCodes),
          },
        })
      : [];
    const classByCode = new Map(classes.map((c) => [c.code, c]));

    const studentCodes = [
      ...new Set(rows.map((r) => r.values.studentCode).filter(Boolean)),
    ];
    const existingStudents = studentCodes.length
      ? await this.studentRepository.find({
          where: { schoolId: params.schoolId, studentCode: In(studentCodes) },
        })
      : [];
    const studentByCode = new Map(
      existingStudents.map((s) => [s.studentCode, s]),
    );

    // identifierCode is now unique per school at the DB level (see migration
    // UniqueStudentIdentifierCode) — pre-check against existing rows so a
    // collision surfaces as a friendly per-row error here instead of
    // aborting the whole confirm() transaction with a raw constraint
    // violation partway through.
    const identifierCodes = [
      ...new Set(rows.map((r) => r.values.identifierCode).filter(Boolean)),
    ];
    const existingStudentsByIdentifierCode = identifierCodes.length
      ? await this.studentRepository.find({
          where: {
            schoolId: params.schoolId,
            identifierCode: In(identifierCodes),
          },
        })
      : [];
    const studentByIdentifierCode = new Map(
      existingStudentsByIdentifierCode.map((s) => [s.identifierCode, s]),
    );

    const existingReceivablesByStudentId = new Set<string>();
    if (params.feePlanId && existingStudents.length) {
      const receivables = await this.receivableRepository.find({
        where: {
          feePlanId: params.feePlanId,
          studentId: In(existingStudents.map((s) => s.id)),
        },
      });
      receivables.forEach((r) =>
        existingReceivablesByStudentId.add(r.studentId),
      );
    }

    const seenStudentCodes = new Set<string>();
    const seenIdentifierCodes = new Set<string>();

    const addError = (
      row: RawImportRow,
      column: string,
      field: string,
      value: unknown,
      message: string,
    ) => {
      errors.push({
        sheet: row.sheet,
        row: row.rowNumber,
        column,
        field,
        value,
        message,
      });
    };

    for (const row of rows) {
      const v = row.values;
      let rowHasError = false;

      const fullName = v.fullName?.trim();
      if (!fullName) {
        addError(row, 'TÊN HS', 'fullName', v.fullName, 'Thiếu tên học sinh');
        rowHasError = true;
      }

      const classCode = v.classCode?.trim();
      let matchedClass: Class | undefined;
      if (!classCode) {
        addError(row, 'LỚP', 'classCode', v.classCode, 'Thiếu mã lớp');
        rowHasError = true;
      } else {
        matchedClass = classByCode.get(classCode);
        if (!matchedClass) {
          addError(
            row,
            'LỚP',
            'classCode',
            classCode,
            `Lớp "${classCode}" không tồn tại trong năm học này`,
          );
          rowHasError = true;
        }
      }

      const studentCode = v.studentCode?.trim() || null;
      if (studentCode) {
        if (seenStudentCodes.has(studentCode)) {
          addError(
            row,
            'MÃ HS',
            'studentCode',
            studentCode,
            'Mã học sinh bị trùng trong file',
          );
          rowHasError = true;
        }
        seenStudentCodes.add(studentCode);
      }

      const identifierCode = v.identifierCode?.trim() || null;
      if (identifierCode) {
        if (seenIdentifierCodes.has(identifierCode)) {
          addError(
            row,
            'MÃ ĐỊNH DANH',
            'identifierCode',
            identifierCode,
            'Mã định danh bị trùng trong file',
          );
          rowHasError = true;
        }
        seenIdentifierCodes.add(identifierCode);

        const studentCodeForRow = v.studentCode?.trim() || null;
        const conflicting = studentByIdentifierCode.get(identifierCode);
        if (conflicting && conflicting.studentCode !== studentCodeForRow) {
          addError(
            row,
            'MÃ ĐỊNH DANH',
            'identifierCode',
            identifierCode,
            `Mã định danh đã được dùng cho học sinh khác (${conflicting.studentCode})`,
          );
          rowHasError = true;
        }
      }

      if (
        params.type === ImportSessionType.RECEIVABLES &&
        studentCode &&
        !studentByCode.has(studentCode)
      ) {
        addError(
          row,
          'MÃ HS',
          'studentCode',
          studentCode,
          'Học sinh không tồn tại trong hệ thống',
        );
        rowHasError = true;
      }

      let quantity = new Decimal(0);
      let unitPrice = new Decimal(0);
      let originalAmount = new Decimal(0);

      if (params.type !== ImportSessionType.STUDENTS) {
        const quantityRaw = v.quantity?.trim();
        if (
          !quantityRaw ||
          Number.isNaN(Number(quantityRaw)) ||
          Number(quantityRaw) <= 0
        ) {
          addError(
            row,
            'SỐ LƯỢNG (THÁNG)',
            'quantity',
            v.quantity,
            'Số tháng không hợp lệ',
          );
          rowHasError = true;
        } else {
          quantity = new Decimal(quantityRaw);
        }

        const unitPriceRaw = v.unitPrice?.replace(/[.,\s]/g, '');
        if (
          !unitPriceRaw ||
          Number.isNaN(Number(unitPriceRaw)) ||
          Number(unitPriceRaw) <= 0
        ) {
          addError(row, 'ĐƠN GIÁ', 'unitPrice', v.unitPrice, 'Sai đơn giá');
          rowHasError = true;
        } else {
          unitPrice = new Decimal(unitPriceRaw);
        }

        if (!rowHasError) {
          originalAmount = quantity.times(unitPrice);
          if (originalAmount.lt(0)) {
            addError(
              row,
              'THÀNH TIỀN',
              'originalAmount',
              originalAmount.toFixed(2),
              'Số tiền âm',
            );
            rowHasError = true;
          }
        }

        const existingStudent = studentCode
          ? studentByCode.get(studentCode)
          : undefined;
        if (
          existingStudent &&
          existingReceivablesByStudentId.has(existingStudent.id)
        ) {
          addError(
            row,
            'MÃ HS',
            'studentCode',
            studentCode,
            'Khoản thu này đã được lập cho học sinh (trùng)',
          );
          rowHasError = true;
        }
      }

      if (!rowHasError) {
        validRows.push({
          rowNumber: row.rowNumber,
          studentCode,
          identifierCode,
          fullName: fullName,
          address: v.address?.trim() || null,
          phone: v.phone?.trim() || null,
          classCode: classCode,
          quantity: quantity.toFixed(2),
          unitPrice: unitPrice.toFixed(2),
          originalAmount: originalAmount.toFixed(2),
          legacyTransferContent: v.legacyTransferContent?.trim() || null,
          serviceName: v.serviceName?.trim() || null,
        });
      }
    }

    return { validRows, errors };
  }
}
