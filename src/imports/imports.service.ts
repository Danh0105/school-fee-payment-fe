import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import Decimal from 'decimal.js';
import {
  ImportSession,
  ImportSessionStatus,
  ImportSessionType,
  ImportBootstrapContext,
} from './entities/import-session.entity';
import {
  ExcelParserService,
  RawSchoolImportInfo,
} from './excel-parser.service';
import { ImportValidationService } from './import-validation.service';
import { PreviewImportDto } from './dto/preview-import.dto';
import { Class } from '../classes/entities/class.entity';
import { StudentsService } from '../students/students.service';
import { StudentClassesService } from '../student-classes/student-classes.service';
import { ReceivablesService } from '../receivables/receivables.service';
import { FeePlansService } from '../fee-plans/fee-plans.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { School } from '../schools/entities/school.entity';
import { AcademicYear } from '../academic-years/entities/academic-year.entity';
import { SemestersService } from '../semesters/semesters.service';
import {
  AcademicYearStatus,
  ClassStatus,
  EntityStatus,
} from '../common/enums/status.enum';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { Role } from '../common/enums/role.enum';
import { SequenceService } from '../database/sequence.service';
import { Student } from '../students/entities/student.entity';
import {
  ImportPaymentOrdersService,
  PAYMENT_LIST_SERVICE_NAME,
  PreparedOrderQr,
  qrExpiryInstant,
  rowTransferContent,
} from './import-payment-orders.service';
import type { ImportedRowOrder } from './import-payment-qr-pdf.service';

export interface PreviewSummary {
  importSessionId: string;
  paymentQrPdfUrl: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  errors: ImportSession['errors'];
  rows: ImportSession['validRows'];
  paymentOptions: ImportSession['paymentOptions'];
  target: {
    schoolCode: string;
    schoolName: string;
    academicYearName: string;
    schoolWillBeCreated: boolean;
    academicYearWillBeCreated: boolean;
    classesInFile: number;
  } | null;
}

export interface ConfirmSummary {
  schoolsCreated: number;
  academicYearsCreated: number;
  classesCreated: number;
  studentsCreated: number;
  studentsMatched: number;
  receivablesCreated: number;
  receivablesSkipped: number;
  /** Payment list saved for debt clearing: one order per row. */
  paymentOrdersCreated?: number;
  paymentOrders?: ImportedRowOrder[];
}

function normalizeImportDate(value: string): string | null {
  const input = value.trim();
  let match = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
  let year: number;
  let month: number;
  let day: number;
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
  return `${year.toString().padStart(4, '0')}-${month
    .toString()
    .padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function normalizeOption(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .trim()
    .toUpperCase();
}

@Injectable()
export class ImportsService {
  constructor(
    @InjectRepository(ImportSession)
    private readonly sessionRepo: Repository<ImportSession>,
    @InjectRepository(Class)
    private readonly classRepo: Repository<Class>,
    @InjectRepository(School)
    private readonly schoolRepo: Repository<School>,
    @InjectRepository(AcademicYear)
    private readonly academicYearRepo: Repository<AcademicYear>,
    private readonly dataSource: DataSource,
    private readonly excelParserService: ExcelParserService,
    private readonly importValidationService: ImportValidationService,
    private readonly studentsService: StudentsService,
    private readonly studentClassesService: StudentClassesService,
    private readonly receivablesService: ReceivablesService,
    private readonly feePlansService: FeePlansService,
    private readonly auditLogsService: AuditLogsService,
    private readonly semestersService: SemestersService,
    private readonly importPaymentOrdersService: ImportPaymentOrdersService,
    private readonly sequenceService: SequenceService,
  ) {}

  async preview(
    file: Express.Multer.File | undefined,
    dto: PreviewImportDto,
    actor: AuthUser,
  ): Promise<PreviewSummary> {
    this.validateFile(file);

    const type = dto.type ?? ImportSessionType.STUDENTS;
    const paymentList = Boolean(dto.createPaymentOrders);
    if (paymentList && type !== ImportSessionType.STUDENTS) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_ERROR,
        'Lưu để gạch nợ chỉ dùng với danh sách học sinh có cột SỐ TIỀN',
      );
    }
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(new Date());
    if (dto.qrExpiresAt && dto.qrExpiresAt < today) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_ERROR,
        'Ngày hết hạn QR phải từ hôm nay trở đi',
      );
    }
    if (type !== ImportSessionType.STUDENTS && !dto.feePlanId) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_ERROR,
        'feePlanId là bắt buộc với import RECEIVABLES/COMBINED',
      );
    }
    if (dto.feePlanId) {
      await this.feePlansService.findById(dto.feePlanId); // 404s if missing
    }

    const workbook = await this.excelParserService.parseWorkbook(
      file.buffer,
      dto.sheetName,
    );
    const rawRows = workbook.rows;
    const hasSchoolId = Boolean(dto.schoolId);
    const hasAcademicYearId = Boolean(dto.academicYearId);
    if (hasSchoolId !== hasAcademicYearId) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_ERROR,
        'schoolId và academicYearId phải cùng được gửi hoặc cùng để trống',
      );
    }

    let schoolId = dto.schoolId;
    let academicYearId = dto.academicYearId;
    let bootstrapContext: ImportBootstrapContext | null = null;
    if (!schoolId || !academicYearId) {
      if (type !== ImportSessionType.STUDENTS) {
        throw AppException.badRequest(
          ErrorCode.VALIDATION_ERROR,
          'Chỉ hỗ trợ tự khởi tạo trường với import học sinh',
        );
      }
      const bootstrap = await this.resolveBootstrapContext(
        workbook.schoolInfo,
        actor,
      );
      schoolId = bootstrap.schoolId;
      academicYearId = bootstrap.academicYearId;
      bootstrapContext = bootstrap.context;
    }

    // Fail at preview, not at confirm, when no dynamic QR can be made.
    if (paymentList)
      this.importPaymentOrdersService.assertVietinbankConfigured();

    const { validRows, errors } = await this.importValidationService.validate(
      rawRows,
      {
        type,
        schoolId,
        feePlanId: dto.feePlanId,
        allowCreateClasses: Boolean(bootstrapContext) || paymentList,
        paymentList,
      },
      academicYearId,
    );

    const session = this.sessionRepo.create({
      schoolId,
      academicYearId,
      feePlanId: dto.feePlanId ?? null,
      type,
      fileName: file.originalname,
      totalRows: rawRows.length,
      validRowCount: validRows.length,
      invalidRowCount:
        errors.length > 0 ? new Set(errors.map((e) => e.row)).size : 0,
      validRows,
      errors,
      bootstrapContext,
      paymentOptions: {
        createPaymentOrders: paymentList,
        qrExpiresAt: dto.qrExpiresAt ?? null,
        title: workbook.title,
        serviceName: paymentList ? (dto.serviceName ?? null) : null,
      },
      status: ImportSessionStatus.PENDING_CONFIRMATION,
      createdBy: actor.id,
    });
    const saved = await this.sessionRepo.save(session);

    return {
      importSessionId: saved.id,
      paymentQrPdfUrl: `/imports/${saved.id}/payment-qr.pdf`,
      totalRows: saved.totalRows,
      validRows: saved.validRowCount,
      invalidRows: saved.invalidRowCount,
      errors: saved.errors,
      rows: saved.validRows,
      paymentOptions: saved.paymentOptions,
      target: bootstrapContext
        ? {
            schoolCode: bootstrapContext.school.code || 'Tự sinh',
            schoolName: bootstrapContext.school.name,
            academicYearName: bootstrapContext.academicYear.name,
            schoolWillBeCreated: bootstrapContext.createSchool,
            academicYearWillBeCreated: bootstrapContext.createAcademicYear,
            classesInFile: new Set(validRows.map((row) => row.className)).size,
          }
        : null,
    };
  }

  private async resolveBootstrapContext(
    raw: RawSchoolImportInfo | null,
    actor: AuthUser,
  ): Promise<{
    schoolId: string;
    academicYearId: string;
    context: ImportBootstrapContext;
  }> {
    if (actor.role !== Role.SUPER_ADMIN && actor.role !== Role.ADMIN) {
      throw AppException.forbidden(
        ErrorCode.FORBIDDEN,
        'Chỉ quản trị viên được phép tạo trường từ file import',
      );
    }
    if (actor.schoolId) {
      throw AppException.forbidden(
        ErrorCode.SCHOOL_OUT_OF_SCOPE,
        'Tài khoản đã giới hạn theo trường không thể tạo trường mới',
      );
    }
    if (!raw) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_ERROR,
        'Thiếu sheet “Thông tin trường” hoặc chưa nhập dòng 2 của sheet này',
      );
    }

    const code = raw.code.trim();
    const name = raw.name.trim();
    const academicYearName = raw.academicYearName.trim();
    const startDate = normalizeImportDate(raw.academicYearStartDate);
    const endDate = normalizeImportDate(raw.academicYearEndDate);
    const missing = [
      !name && 'TÊN TRƯỜNG',
      !academicYearName && 'NĂM HỌC',
      !raw.academicYearStartDate.trim() && 'NGÀY BẮT ĐẦU',
      !raw.academicYearEndDate.trim() && 'NGÀY KẾT THÚC',
    ].filter(Boolean);
    if (missing.length) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_ERROR,
        `Thiếu thông tin bắt buộc trong sheet “Thông tin trường”: ${missing.join(', ')}`,
      );
    }
    if (!startDate || !endDate || startDate > endDate) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_ERROR,
        'Ngày bắt đầu/kết thúc năm học không hợp lệ; dùng DD/MM/YYYY hoặc YYYY-MM-DD và ngày bắt đầu phải trước ngày kết thúc',
      );
    }

    const schoolStatusValues: Record<string, EntityStatus> = {
      ACTIVE: EntityStatus.ACTIVE,
      'DANG HOAT DONG': EntityStatus.ACTIVE,
      INACTIVE: EntityStatus.INACTIVE,
      'NGUNG HOAT DONG': EntityStatus.INACTIVE,
    };
    const academicYearStatusValues: Record<string, AcademicYearStatus> = {
      ACTIVE: AcademicYearStatus.ACTIVE,
      'DANG HOAT DONG': AcademicYearStatus.ACTIVE,
      DRAFT: AcademicYearStatus.DRAFT,
      'BAN NHAP': AcademicYearStatus.DRAFT,
      CLOSED: AcademicYearStatus.CLOSED,
      'DA DONG': AcademicYearStatus.CLOSED,
    };
    const schoolStatus = raw.status.trim()
      ? schoolStatusValues[normalizeOption(raw.status)]
      : EntityStatus.ACTIVE;
    const academicYearStatus = raw.academicYearStatus.trim()
      ? academicYearStatusValues[normalizeOption(raw.academicYearStatus)]
      : AcademicYearStatus.ACTIVE;
    if (!schoolStatus || !academicYearStatus) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_ERROR,
        'Trạng thái trường hoặc trạng thái năm học không hợp lệ',
      );
    }

    const existingSchool = code
      ? await this.schoolRepo.findOne({
          where: { code, deletedAt: IsNull() },
        })
      : await this.schoolRepo.findOne({
          where: { name, deletedAt: IsNull() },
        });
    if (
      existingSchool &&
      actor.role !== Role.SUPER_ADMIN &&
      actor.companyId &&
      existingSchool.companyId !== actor.companyId
    ) {
      throw AppException.forbidden(ErrorCode.SCHOOL_OUT_OF_SCOPE);
    }
    const schoolId = existingSchool?.id ?? randomUUID();
    const existingAcademicYear = existingSchool
      ? await this.academicYearRepo.findOne({
          where: { schoolId, name: academicYearName },
        })
      : null;
    const academicYearId = existingAcademicYear?.id ?? randomUUID();

    return {
      schoolId,
      academicYearId,
      context: {
        createSchool: !existingSchool,
        createAcademicYear: !existingAcademicYear,
        companyId: existingSchool?.companyId ?? actor.companyId ?? null,
        school: {
          code: existingSchool?.code ?? '',
          name,
          address: raw.address.trim() || null,
          phone: raw.phone.trim() || null,
          taxCode: raw.taxCode.trim() || null,
          managerInfo: raw.managerInfo.trim() || null,
          salesRepresentative: raw.salesRepresentative.trim() || null,
          bankName: raw.bankName.trim() || null,
          bankCode: raw.bankCode.trim() || null,
          bankAccountNumber: raw.bankAccountNumber.trim() || null,
          bankAccountName: raw.bankAccountName.trim() || null,
          status: schoolStatus,
        },
        academicYear: {
          name: academicYearName,
          startDate,
          endDate,
          status: academicYearStatus,
        },
      },
    };
  }

  private validateFile(
    file: Express.Multer.File | undefined,
  ): asserts file is Express.Multer.File {
    if (!file?.buffer?.length) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_ERROR,
        'Vui lòng chọn file Excel để import',
      );
    }

    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_ERROR,
        'Chỉ hỗ trợ file .xlsx. Với file .xls, hãy mở bằng Excel và lưu lại dưới dạng Excel Workbook (*.xlsx)',
      );
    }
  }

  async confirm(
    importSessionId: string,
    actor: { userId: string; ipAddress?: string; userAgent?: string },
  ): Promise<ConfirmSummary> {
    const session = await this.sessionRepo.findOne({
      where: { id: importSessionId },
    });
    if (!session)
      throw AppException.notFound(ErrorCode.IMPORT_SESSION_NOT_FOUND);
    if (session.status !== ImportSessionStatus.PENDING_CONFIRMATION) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_ERROR,
        'Phiên import này đã được xử lý hoặc đã hết hạn',
      );
    }
    if (session.validRowCount === 0) {
      throw AppException.badRequest(
        ErrorCode.IMPORT_VALIDATION_FAILED,
        'Không có dòng dữ liệu hợp lệ để import',
      );
    }

    const feePlan = session.feePlanId
      ? await this.feePlansService.findById(session.feePlanId)
      : null;
    const paymentList = Boolean(session.paymentOptions?.createPaymentOrders);
    // VietinBank is called before the transaction opens; see prepareOrderQr.
    const preparedQrs = new Map<number, PreparedOrderQr>();
    if (paymentList) {
      const payee = this.importPaymentOrdersService.beneficiaryName(
        session.bootstrapContext?.school.name ??
          (await this.schoolRepo.findOne({ where: { id: session.schoolId } }))
            ?.name ??
          '',
      );
      for (const row of session.validRows) {
        preparedQrs.set(
          row.rowNumber,
          await this.importPaymentOrdersService.prepareOrderQr(
            new Decimal(row.originalAmount),
            payee,
          ),
        );
      }
    }

    return this.dataSource.transaction(async (manager) => {
      let schoolId = session.schoolId;
      let academicYearId = session.academicYearId;
      let schoolsCreated = 0;
      let academicYearsCreated = 0;
      let classesCreated = 0;

      if (session.bootstrapContext) {
        const context = session.bootstrapContext;
        const schoolRepository = manager.getRepository(School);
        let school = context.school.code
          ? await schoolRepository.findOne({
              where: { code: context.school.code, deletedAt: IsNull() },
            })
          : await schoolRepository.findOne({
              where: { name: context.school.name, deletedAt: IsNull() },
            });
        if (!school) {
          const schoolCode = await this.sequenceService.generateCode(
            'SCH',
            'SCHOOL',
            6,
            manager,
          );
          school = await schoolRepository.save(
            schoolRepository.create({
              id: session.schoolId,
              companyId: context.companyId,
              ...context.school,
              code: schoolCode,
              deletedAt: null,
            }),
          );
          schoolsCreated += 1;
        }
        schoolId = school.id;
        context.school.code = school.code;

        const academicYearRepository = manager.getRepository(AcademicYear);
        let academicYear = await academicYearRepository.findOne({
          where: {
            schoolId,
            name: context.academicYear.name,
          },
        });
        if (!academicYear) {
          academicYear = await academicYearRepository.save(
            academicYearRepository.create({
              id: session.academicYearId,
              schoolId,
              ...context.academicYear,
            }),
          );
          academicYearsCreated += 1;
        }
        academicYearId = academicYear.id;
        await this.semestersService.synchronizeDefaults(academicYear, manager);

        classesCreated += await this.ensureClassesByName(
          manager,
          schoolId,
          academicYearId,
          session.validRows,
        );
      } else if (paymentList) {
        classesCreated += await this.ensureClassesByName(
          manager,
          schoolId,
          academicYearId,
          session.validRows,
        );
      }

      const classes = await manager.getRepository(Class).find({
        where: {
          schoolId,
          academicYearId,
        },
      });
      const classByCode = new Map(classes.map((c) => [c.code, c]));
      const classByName = new Map(classes.map((c) => [c.name, c]));

      let studentsCreated = 0;
      let studentsMatched = 0;
      let receivablesCreated = 0;
      let receivablesSkipped = 0;

      const listRows: {
        row: (typeof session.validRows)[number];
        student: Student;
      }[] = [];
      for (const row of session.validRows) {
        let student = row.studentCode
          ? await this.studentsService.findByStudentCode(
              schoolId,
              row.studentCode,
              manager,
            )
          : null;
        // A payment list names students by identifier code, not student code.
        if (!student && paymentList && row.identifierCode) {
          student = await manager.getRepository(Student).findOne({
            where: {
              schoolId,
              identifierCode: row.identifierCode,
              deletedAt: IsNull(),
            },
          });
        }

        if (student) {
          studentsMatched += 1;
        } else if (session.type !== ImportSessionType.RECEIVABLES) {
          student = await this.studentsService.create(
            {
              schoolId,
              studentCode: row.studentCode ?? undefined,
              identifierCode: row.identifierCode ?? undefined,
              fullName: row.fullName,
              dateOfBirth: row.dateOfBirth ?? undefined,
              gender: row.gender ?? undefined,
              address: row.address ?? undefined,
              phone: row.phone ?? undefined,
              parentName: row.parentName ?? undefined,
              parentPhone: row.parentPhone ?? undefined,
              parentEmail: row.parentEmail ?? undefined,
              status: row.status,
            },
            manager,
          );
          studentsCreated += 1;
        } else {
          // Should not happen: RECEIVABLES rows without a matching student were rejected during validation.
          continue;
        }

        const klass =
          session.bootstrapContext || paymentList
            ? classByName.get(row.className)
            : classByCode.get(row.classCode);
        if (klass) {
          await this.studentClassesService.assign(
            {
              studentId: student.id,
              classId: klass.id,
              academicYearId,
            },
            manager,
          );
        }

        if (session.type !== ImportSessionType.STUDENTS && feePlan) {
          const receivable = await this.receivablesService.createIfNotExists(
            {
              schoolId,
              studentId: student.id,
              academicYearId,
              semesterId: feePlan.semesterId,
              feePlanId: feePlan.id,
              description: row.serviceName ?? feePlan.feeCategory.name,
              quantity: new Decimal(row.quantity),
              unitPrice: new Decimal(row.unitPrice),
              dueDate: feePlan.dueDate,
              createdBy: actor.userId,
            },
            manager,
          );
          if (receivable) receivablesCreated += 1;
          else receivablesSkipped += 1;
        }
        if (paymentList) listRows.push({ row, student });
      }

      const paymentOrders: ImportedRowOrder[] = [];
      if (paymentList && listRows.length) {
        const school = await manager
          .getRepository(School)
          .findOneOrFail({ where: { id: schoolId } });
        const dueDate = session.paymentOptions?.qrExpiresAt ?? null;
        const listPlan =
          await this.importPaymentOrdersService.createListFeePlan(manager, {
            importSessionId: session.id,
            schoolId,
            academicYearId,
            name:
              session.paymentOptions?.title ||
              `Danh sách thu ${session.fileName}`,
            unitPrice: new Decimal(listRows[0].row.originalAmount),
            dueDate,
            createdBy: actor.userId,
          });
        session.feePlanId = listPlan.id;
        for (const { row, student } of listRows) {
          const amount = new Decimal(row.originalAmount);
          const receivable = await this.receivablesService.createIfNotExists(
            {
              schoolId,
              studentId: student.id,
              academicYearId,
              semesterId: null,
              feePlanId: listPlan.id,
              // The list's title names the fee plan; the debt says what it
              // is for, since receipts and e-invoices print it.
              description:
                session.paymentOptions?.serviceName ||
                PAYMENT_LIST_SERVICE_NAME,
              quantity: new Decimal(1),
              unitPrice: amount,
              dueDate,
              createdBy: actor.userId,
            },
            manager,
          );
          if (!receivable) {
            receivablesSkipped += 1;
            continue;
          }
          receivablesCreated += 1;
          const order = await this.importPaymentOrdersService.createOrderForRow(
            manager,
            {
              schoolId,
              studentId: student.id,
              receivableId: receivable.id,
              amount,
              listContent: rowTransferContent(
                { ...row, studentCode: row.studentCode ?? student.studentCode },
                school.code,
              ),
              prepared: preparedQrs.get(row.rowNumber)!,
              expiresAt: qrExpiryInstant(dueDate),
              createdBy: actor.userId,
            },
          );
          paymentOrders.push({
            rowNumber: row.rowNumber,
            paymentOrderId: order.id,
            orderCode: order.orderCode,
          });
        }
      }

      const summary: ConfirmSummary = {
        schoolsCreated,
        academicYearsCreated,
        classesCreated,
        studentsCreated,
        studentsMatched,
        receivablesCreated,
        receivablesSkipped,
        ...(paymentList
          ? { paymentOrdersCreated: paymentOrders.length, paymentOrders }
          : {}),
      };

      session.status = ImportSessionStatus.CONFIRMED;
      session.schoolId = schoolId;
      session.academicYearId = academicYearId;
      session.confirmResult = summary as unknown as Record<string, unknown>;
      await manager.getRepository(ImportSession).save(session);

      await this.auditLogsService.record(
        {
          userId: actor.userId,
          action: 'CREATE',
          entityType: 'ImportSession',
          entityId: session.id,
          newData: summary as unknown as Record<string, unknown>,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        },
        manager,
      );

      return summary;
    });
  }

  /** Creates the classes the rows name that the academic year lacks. */
  private async ensureClassesByName(
    manager: EntityManager,
    schoolId: string,
    academicYearId: string,
    rows: ImportSession['validRows'],
  ): Promise<number> {
    let classesCreated = 0;
    const classRepository = manager.getRepository(Class);
    const existingClasses = await classRepository.find({
      where: { schoolId, academicYearId },
    });
    const existingClassNames = new Set(
      existingClasses.map((item) => item.name),
    );
    const classDefinitions = new Map<string, { grade: string | null }>();
    for (const row of rows) {
      if (!classDefinitions.has(row.className)) {
        classDefinitions.set(row.className, {
          grade: row.classGrade ?? null,
        });
      }
    }
    for (const [name, definition] of classDefinitions) {
      if (existingClassNames.has(name)) continue;
      const code = await this.sequenceService.generateCode(
        'CLS',
        `CLASS:${schoolId}:${academicYearId}`,
        6,
        manager,
      );
      await classRepository.save(
        classRepository.create({
          schoolId,
          academicYearId,
          code,
          name,
          grade: definition.grade,
          status: ClassStatus.ACTIVE,
        }),
      );
      classesCreated += 1;
    }
    return classesCreated;
  }

  async findById(id: string): Promise<ImportSession> {
    const session = await this.sessionRepo.findOne({ where: { id } });
    if (!session)
      throw AppException.notFound(ErrorCode.IMPORT_SESSION_NOT_FOUND);
    return session;
  }
}
