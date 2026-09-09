import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import Decimal from 'decimal.js';
import {
  ImportSession,
  ImportSessionStatus,
  ImportSessionType,
} from './entities/import-session.entity';
import { ExcelParserService } from './excel-parser.service';
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

export interface PreviewSummary {
  importSessionId: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  errors: ImportSession['errors'];
}

export interface ConfirmSummary {
  studentsCreated: number;
  studentsMatched: number;
  receivablesCreated: number;
  receivablesSkipped: number;
}

@Injectable()
export class ImportsService {
  constructor(
    @InjectRepository(ImportSession)
    private readonly sessionRepo: Repository<ImportSession>,
    @InjectRepository(Class)
    private readonly classRepo: Repository<Class>,
    private readonly dataSource: DataSource,
    private readonly excelParserService: ExcelParserService,
    private readonly importValidationService: ImportValidationService,
    private readonly studentsService: StudentsService,
    private readonly studentClassesService: StudentClassesService,
    private readonly receivablesService: ReceivablesService,
    private readonly feePlansService: FeePlansService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async preview(
    file: Express.Multer.File,
    dto: PreviewImportDto,
    actor: { userId: string },
  ): Promise<PreviewSummary> {
    const type = dto.type ?? ImportSessionType.COMBINED;
    if (type !== ImportSessionType.STUDENTS && !dto.feePlanId) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_ERROR,
        'feePlanId là bắt buộc với import RECEIVABLES/COMBINED',
      );
    }
    if (dto.feePlanId) {
      await this.feePlansService.findById(dto.feePlanId); // 404s if missing
    }

    const rawRows = await this.excelParserService.parse(file.buffer);
    const { validRows, errors } = await this.importValidationService.validate(
      rawRows,
      { type, schoolId: dto.schoolId, feePlanId: dto.feePlanId },
      dto.academicYearId,
    );

    const session = this.sessionRepo.create({
      schoolId: dto.schoolId,
      academicYearId: dto.academicYearId,
      feePlanId: dto.feePlanId ?? null,
      type,
      fileName: file.originalname,
      totalRows: rawRows.length,
      validRowCount: validRows.length,
      invalidRowCount:
        errors.length > 0 ? new Set(errors.map((e) => e.row)).size : 0,
      validRows,
      errors,
      status: ImportSessionStatus.PENDING_CONFIRMATION,
      createdBy: actor.userId,
    });
    const saved = await this.sessionRepo.save(session);

    return {
      importSessionId: saved.id,
      totalRows: saved.totalRows,
      validRows: saved.validRowCount,
      invalidRows: saved.invalidRowCount,
      errors: saved.errors,
    };
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

    return this.dataSource.transaction(async (manager) => {
      const classes = await manager.getRepository(Class).find({
        where: {
          schoolId: session.schoolId,
          academicYearId: session.academicYearId,
        },
      });
      const classByCode = new Map(classes.map((c) => [c.code, c]));

      let studentsCreated = 0;
      let studentsMatched = 0;
      let receivablesCreated = 0;
      let receivablesSkipped = 0;

      for (const row of session.validRows) {
        let student = row.studentCode
          ? await this.studentsService.findByStudentCode(
              session.schoolId,
              row.studentCode,
              manager,
            )
          : null;

        if (student) {
          studentsMatched += 1;
        } else if (session.type !== ImportSessionType.RECEIVABLES) {
          student = await this.studentsService.create(
            {
              schoolId: session.schoolId,
              studentCode: row.studentCode ?? undefined,
              identifierCode: row.identifierCode ?? undefined,
              fullName: row.fullName,
              address: row.address ?? undefined,
              phone: row.phone ?? undefined,
            },
            manager,
          );
          studentsCreated += 1;
        } else {
          // Should not happen: RECEIVABLES rows without a matching student were rejected during validation.
          continue;
        }

        const klass = classByCode.get(row.classCode);
        if (klass) {
          await this.studentClassesService.assign(
            {
              studentId: student.id,
              classId: klass.id,
              academicYearId: session.academicYearId,
            },
            manager,
          );
        }

        if (session.type !== ImportSessionType.STUDENTS && feePlan) {
          const receivable = await this.receivablesService.createIfNotExists(
            {
              schoolId: session.schoolId,
              studentId: student.id,
              academicYearId: session.academicYearId,
              semesterId: feePlan.semesterId,
              feePlanId: feePlan.id,
              description: row.serviceName ?? feePlan.name,
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
      }

      const summary: ConfirmSummary = {
        studentsCreated,
        studentsMatched,
        receivablesCreated,
        receivablesSkipped,
      };

      session.status = ImportSessionStatus.CONFIRMED;
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

  async findById(id: string): Promise<ImportSession> {
    const session = await this.sessionRepo.findOne({ where: { id } });
    if (!session)
      throw AppException.notFound(ErrorCode.IMPORT_SESSION_NOT_FOUND);
    return session;
  }
}
