import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { FeeAssignment } from './entities/fee-assignment.entity';
import { CreateFeeAssignmentDto } from './dto/create-fee-assignment.dto';
import { FeePlansService } from '../fee-plans/fee-plans.service';
import { FeePlan } from '../fee-plans/entities/fee-plan.entity';
import { StudentClassesService } from '../student-classes/student-classes.service';
import { ReceivablesService } from '../receivables/receivables.service';
import { SemestersService } from '../semesters/semesters.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import {
  BillingType,
  FeeAssignmentTargetType,
  FeePlanStatus,
} from '../common/enums/status.enum';

interface ReceivableSlot {
  semesterId: string | null;
  quantity: Decimal;
  description: string;
  dueDate: string | null;
}

export interface AssignResult {
  targetedStudents: number;
  receivablesCreated: number;
  receivablesSkipped: number;
}

@Injectable()
export class FeeAssignmentsService {
  constructor(
    @InjectRepository(FeeAssignment)
    private readonly repo: Repository<FeeAssignment>,
    private readonly dataSource: DataSource,
    private readonly feePlansService: FeePlansService,
    private readonly studentClassesService: StudentClassesService,
    private readonly receivablesService: ReceivablesService,
    private readonly semestersService: SemestersService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async assign(
    feePlanId: string,
    dto: CreateFeeAssignmentDto,
    actor: { userId: string; ipAddress?: string; userAgent?: string },
  ): Promise<AssignResult> {
    const feePlan = await this.feePlansService.findById(feePlanId);
    if (feePlan.status !== FeePlanStatus.ACTIVE) {
      throw AppException.badRequest(ErrorCode.FEE_PLAN_NOT_ACTIVE);
    }
    const receivableSlots = await this.resolveReceivableSlots(feePlan);

    let studentIds: string[] = [];
    switch (dto.targetType) {
      case FeeAssignmentTargetType.SCHOOL:
        studentIds = await this.studentClassesService.findStudentIdsByTarget({
          academicYearId: feePlan.academicYearId,
          schoolId: feePlan.schoolId,
        });
        break;
      case FeeAssignmentTargetType.GRADE:
        if (!dto.grade)
          throw AppException.badRequest(
            ErrorCode.VALIDATION_ERROR,
            'grade là bắt buộc',
          );
        studentIds = await this.studentClassesService.findStudentIdsByTarget({
          academicYearId: feePlan.academicYearId,
          schoolId: feePlan.schoolId,
          grade: dto.grade,
        });
        break;
      case FeeAssignmentTargetType.CLASS:
        if (!dto.classIds?.length)
          throw AppException.badRequest(
            ErrorCode.VALIDATION_ERROR,
            'classIds là bắt buộc',
          );
        studentIds = await this.studentClassesService.findStudentIdsByTarget({
          academicYearId: feePlan.academicYearId,
          classIds: dto.classIds,
        });
        break;
      case FeeAssignmentTargetType.STUDENT:
        if (!dto.studentIds?.length)
          throw AppException.badRequest(
            ErrorCode.VALIDATION_ERROR,
            'studentIds là bắt buộc',
          );
        studentIds = dto.studentIds;
        break;
    }

    studentIds = [...new Set(studentIds)];

    return this.dataSource.transaction(async (manager) => {
      const assignmentRepo = manager.getRepository(FeeAssignment);
      const targetIds =
        dto.targetType === FeeAssignmentTargetType.CLASS
          ? (dto.classIds ?? [])
          : dto.targetType === FeeAssignmentTargetType.STUDENT
            ? (dto.studentIds ?? [])
            : dto.targetType === FeeAssignmentTargetType.GRADE
              ? [dto.grade!]
              : [null];

      for (const targetId of targetIds) {
        await assignmentRepo.save(
          assignmentRepo.create({
            feePlanId,
            targetType: dto.targetType,
            targetId,
            createdBy: actor.userId,
          }),
        );
      }

      let created = 0;
      let skipped = 0;
      for (const studentId of studentIds) {
        for (const slot of receivableSlots) {
          const receivable = await this.receivablesService.createIfNotExists(
            {
              schoolId: feePlan.schoolId,
              studentId,
              academicYearId: feePlan.academicYearId,
              semesterId: slot.semesterId,
              feePlanId: feePlan.id,
              description: slot.description,
              quantity: slot.quantity,
              unitPrice: feePlan.unitPrice,
              dueDate: slot.dueDate,
              createdBy: actor.userId,
            },
            manager,
          );
          if (receivable) created += 1;
          else skipped += 1;
        }
      }

      await this.auditLogsService.record(
        {
          userId: actor.userId,
          action: 'CREATE_RECEIVABLE',
          entityType: 'FeePlan',
          entityId: feePlanId,
          newData: {
            targetType: dto.targetType,
            studentsTargeted: studentIds.length,
            created,
            skipped,
          },
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        },
        manager,
      );

      return {
        targetedStudents: studentIds.length,
        receivablesCreated: created,
        receivablesSkipped: skipped,
      };
    });
  }

  /**
   * A ONE_TIME plan produces a single receivable for its full amount. A
   * MONTHLY plan represents a whole-year fee that parents may pay per
   * semester, so it's split into one receivable per HK1/HK2, each for half
   * the quantity — the parent can then pay one semester's receivable (and
   * the other stays recorded as outstanding công nợ) or both to cover the
   * year in a single payment order.
   */
  private async resolveReceivableSlots(
    feePlan: FeePlan,
  ): Promise<ReceivableSlot[]> {
    if (feePlan.billingType === BillingType.ONE_TIME) {
      return [
        {
          semesterId: feePlan.semesterId,
          quantity: feePlan.quantity,
          description: feePlan.name,
          dueDate: feePlan.dueDate,
        },
      ];
    }

    const semesters = await this.semestersService.findPairByAcademicYear(
      feePlan.academicYearId,
    );
    const halfQuantity = feePlan.quantity.dividedBy(2);
    return semesters.map((semester) => ({
      semesterId: semester.id,
      quantity: halfQuantity,
      description: `${feePlan.name} - ${semester.name}`,
      dueDate: semester.endDate,
    }));
  }
}
