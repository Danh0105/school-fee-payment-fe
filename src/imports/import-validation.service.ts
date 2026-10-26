import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
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
import { isEmail } from 'class-validator';
import { StudentStatus } from '../common/enums/status.enum';
import { Gender } from '../students/entities/student.entity';

export interface ValidateParams {
  type: ImportSessionType;
  schoolId: string;
  feePlanId?: string;
  allowCreateClasses?: boolean;
  /**
   * Payment list saved for debt clearing: each row needs an amount, and a
   * student already in the school with the row's identifier code is the
   * same student rather than a conflict.
   */
  paymentList?: boolean;
}

export interface ValidationResult {
  validRows: ParsedImportRow[];
  errors: ImportRowError[];
}

function normalizeDate(value: string): string | null {
  const input = value.trim();
  if (!input) return null;

  let year: number;
  let month: number;
  let day: number;
  let match = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    match = input.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (!match) return null;
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3]);
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseVndAmount(value: string): Decimal | null {
  const normalized = value.replace(/[.,\s]/g, '');
  if (!/^\d+$/.test(normalized)) return null;
  const amount = new Decimal(normalized);
  return amount.gt(0) ? amount : null;
}

const GENDER_VALUES: Record<string, Gender> = {
  NAM: Gender.MALE,
  MALE: Gender.MALE,
  NU: Gender.FEMALE,
  FEMALE: Gender.FEMALE,
  KHAC: Gender.OTHER,
  OTHER: Gender.OTHER,
};

const STATUS_VALUES: Record<string, StudentStatus> = {
  ACTIVE: StudentStatus.ACTIVE,
  'DANG HOC': StudentStatus.ACTIVE,
  INACTIVE: StudentStatus.INACTIVE,
  'NGUNG HOC': StudentStatus.INACTIVE,
  GRADUATED: StudentStatus.GRADUATED,
  'DA TOT NGHIEP': StudentStatus.GRADUATED,
  TRANSFERRED: StudentStatus.TRANSFERRED,
  'DA CHUYEN TRUONG': StudentStatus.TRANSFERRED,
};

function normalizeOption(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .trim();
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
    const classNames = [
      ...new Set(rows.map((r) => r.values.className).filter(Boolean)),
    ];
    const classWhere: FindOptionsWhere<Class>[] = params.allowCreateClasses
      ? classNames.length
        ? [
            {
              schoolId: params.schoolId,
              academicYearId,
              name: In(classNames),
            },
          ]
        : []
      : [
          ...(classCodes.length
            ? [
                {
                  schoolId: params.schoolId,
                  academicYearId,
                  code: In(classCodes),
                },
              ]
            : []),
          ...(classNames.length
            ? [
                {
                  schoolId: params.schoolId,
                  academicYearId,
                  name: In(classNames),
                },
              ]
            : []),
        ];
    const classes = classWhere.length
      ? await this.classRepository.find({ where: classWhere })
      : [];
    const classByCode = new Map(classes.map((c) => [c.code, c]));
    const classByName = new Map(classes.map((c) => [c.name, c]));

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
    const classDefinitions = new Map<
      string,
      { name: string; grade: string | null }
    >();

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

      const dateOfBirthRaw = v.dateOfBirth?.trim();
      const dateOfBirth = dateOfBirthRaw ? normalizeDate(dateOfBirthRaw) : null;
      if (dateOfBirthRaw && !dateOfBirth) {
        addError(
          row,
          'NGÀY SINH',
          'dateOfBirth',
          dateOfBirthRaw,
          'Ngày sinh không hợp lệ; dùng DD/MM/YYYY hoặc YYYY-MM-DD',
        );
        rowHasError = true;
      }

      const genderRaw = v.gender?.trim();
      const gender = genderRaw
        ? GENDER_VALUES[normalizeOption(genderRaw)]
        : null;
      if (genderRaw && !gender) {
        addError(
          row,
          'GIỚI TÍNH',
          'gender',
          genderRaw,
          'Giới tính không hợp lệ; dùng Nam, Nữ hoặc Khác',
        );
        rowHasError = true;
      }

      const parentEmail = v.parentEmail?.trim() || null;
      if (parentEmail && !isEmail(parentEmail)) {
        addError(
          row,
          'EMAIL PHỤ HUYNH',
          'parentEmail',
          parentEmail,
          'Email phụ huynh không hợp lệ',
        );
        rowHasError = true;
      }

      const statusRaw = v.status?.trim();
      const status = statusRaw
        ? STATUS_VALUES[normalizeOption(statusRaw)]
        : StudentStatus.ACTIVE;
      if (statusRaw && !status) {
        addError(
          row,
          'TRẠNG THÁI',
          'status',
          statusRaw,
          'Trạng thái không hợp lệ; dùng Đang học, Ngừng học, Đã tốt nghiệp hoặc Đã chuyển trường',
        );
        rowHasError = true;
      }

      const suppliedClassCode = v.classCode?.trim();
      const suppliedClassName = v.className?.trim();
      const className = params.allowCreateClasses
        ? suppliedClassName
        : suppliedClassName || suppliedClassCode;
      const classGrade = v.classGrade?.trim() || null;
      let matchedClass: Class | undefined;
      if (params.allowCreateClasses && !className) {
        addError(row, 'TÊN LỚP', 'className', v.className, 'Thiếu tên lớp');
        rowHasError = true;
      } else if (!params.allowCreateClasses && !suppliedClassCode) {
        addError(row, 'LỚP', 'classCode', v.classCode, 'Thiếu mã lớp');
        rowHasError = true;
      } else {
        matchedClass = params.allowCreateClasses
          ? classByName.get(className)
          : (classByCode.get(suppliedClassCode) ??
            classByName.get(suppliedClassName || suppliedClassCode));
        if (!matchedClass && !params.allowCreateClasses) {
          addError(
            row,
            'LỚP',
            'classCode',
            suppliedClassCode,
            `Lớp "${suppliedClassCode}" không tồn tại trong năm học này`,
          );
          rowHasError = true;
        }

        const classKey = params.allowCreateClasses
          ? className
          : suppliedClassCode;
        const previousDefinition = classDefinitions.get(classKey);
        if (
          previousDefinition &&
          (previousDefinition.name !== className ||
            previousDefinition.grade !== classGrade)
        ) {
          addError(
            row,
            params.allowCreateClasses ? 'TÊN LỚP' : 'MÃ LỚP',
            params.allowCreateClasses ? 'className' : 'classCode',
            classKey,
            `Lớp "${classKey}" có thông tin không thống nhất trong file`,
          );
          rowHasError = true;
        } else if (!previousDefinition) {
          classDefinitions.set(classKey, {
            name: className,
            grade: classGrade,
          });
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
        const sameStudent = params.paymentList && !studentCodeForRow;
        if (
          conflicting &&
          !sameStudent &&
          conflicting.studentCode !== studentCodeForRow
        ) {
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
      if (params.paymentList && !v.buyerIdNo?.trim() && !identifierCode) {
        addError(
          row,
          'CCCD NGƯỜI MUA',
          'buyerIdNo',
          v.buyerIdNo,
          'Thiếu CCCD người mua hoặc mã định danh học sinh',
        );
        rowHasError = true;
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

      if (params.type === ImportSessionType.STUDENTS) {
        // SỐ TIỀN is what the bank must receive. Older files may only have
        // THÀNH TIỀN, so keep accepting it as the payment amount fallback.
        const importedAmount =
          v.paymentAmount?.trim() || v.originalAmount?.trim();
        if (!importedAmount && params.paymentList) {
          addError(
            row,
            'SỐ TIỀN',
            'originalAmount',
            v.originalAmount,
            'Thiếu số tiền cần thu',
          );
          rowHasError = true;
        }
        if (importedAmount) {
          const parsedAmount = parseVndAmount(importedAmount);
          if (!parsedAmount) {
            addError(
              row,
              'SỐ TIỀN (VND)',
              'originalAmount',
              importedAmount,
              'Số tiền thanh toán phải là số nguyên dương',
            );
            rowHasError = true;
          } else {
            originalAmount = parsedAmount;
          }
        }

        if (params.paymentList && originalAmount.gt(0)) {
          const quantityRaw = v.quantity?.trim();
          if (quantityRaw) {
            try {
              quantity = new Decimal(quantityRaw.replace(',', '.'));
            } catch {
              quantity = new Decimal(0);
            }
            if (!quantity.isFinite() || quantity.lte(0)) {
              addError(
                row,
                'SỐ LƯỢNG',
                'quantity',
                v.quantity,
                'Số lượng phải là số dương',
              );
              rowHasError = true;
            }
          } else {
            quantity = new Decimal(1);
          }

          const unitPriceRaw = v.unitPrice?.trim();
          if (unitPriceRaw) {
            const parsedUnitPrice = parseVndAmount(unitPriceRaw);
            if (!parsedUnitPrice) {
              addError(
                row,
                'ĐƠN GIÁ',
                'unitPrice',
                v.unitPrice,
                'Đơn giá phải là số nguyên dương',
              );
              rowHasError = true;
            } else {
              unitPrice = parsedUnitPrice;
            }
          } else if (quantity.gt(0)) {
            unitPrice = originalAmount.div(quantity);
          }

          const invoiceTotalRaw = v.originalAmount?.trim();
          const invoiceTotal = invoiceTotalRaw
            ? parseVndAmount(invoiceTotalRaw)
            : originalAmount;
          if (invoiceTotalRaw && !invoiceTotal) {
            addError(
              row,
              'THÀNH TIỀN',
              'originalAmount',
              invoiceTotalRaw,
              'Thành tiền phải là số nguyên dương',
            );
            rowHasError = true;
          } else if (invoiceTotal && !invoiceTotal.equals(originalAmount)) {
            addError(
              row,
              'THÀNH TIỀN',
              'originalAmount',
              invoiceTotalRaw,
              'Thành tiền phải khớp với Số tiền cần thu',
            );
            rowHasError = true;
          }
          if (
            quantity.gt(0) &&
            unitPrice.gt(0) &&
            !quantity.times(unitPrice).equals(originalAmount)
          ) {
            addError(
              row,
              'ĐƠN GIÁ',
              'unitPrice',
              v.unitPrice,
              'Số lượng × Đơn giá phải bằng Thành tiền',
            );
            rowHasError = true;
          }
        }
      } else {
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
          dateOfBirth,
          gender,
          address: v.address?.trim() || null,
          phone: v.phone?.trim() || null,
          parentName: v.parentName?.trim() || null,
          parentPhone: v.parentPhone?.trim() || null,
          parentEmail,
          status: status ?? StudentStatus.ACTIVE,
          classCode: matchedClass?.code ?? suppliedClassCode ?? className,
          className,
          classGrade,
          quantity: quantity.toFixed(2),
          unitPrice: unitPrice.toFixed(2),
          originalAmount: originalAmount.toFixed(2),
          legacyTransferContent: v.legacyTransferContent?.trim() || null,
          serviceName: v.serviceName?.trim() || null,
          unitName: v.unitName?.trim() || null,
          buyerName: v.buyerName?.trim() || fullName,
          buyerAddress: v.buyerAddress?.trim() || v.address?.trim() || null,
          buyerIdNo: v.buyerIdNo?.trim() || identifierCode,
        });
      }
    }

    return { validRows, errors };
  }
}
