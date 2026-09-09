import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AccessControlService } from '../access-control/access-control.service';
import { FeePlansService } from '../fee-plans/fee-plans.service';
import { FeeAssignmentsService } from './fee-assignments.service';
import { CreateFeeAssignmentDto } from './dto/create-fee-assignment.dto';

@ApiTags('Fee Plans')
@ApiBearerAuth()
@Controller('fee-plans/:id/assign')
export class FeeAssignmentsController {
  constructor(
    private readonly service: FeeAssignmentsService,
    private readonly feePlansService: FeePlansService,
    private readonly accessControlService: AccessControlService,
  ) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async assign(
    @Param('id', ParseUUIDPipe) feePlanId: string,
    @Body() dto: CreateFeeAssignmentDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const feePlan = await this.feePlansService.findById(feePlanId);
    await this.accessControlService.assertSchoolAccess(user, feePlan.schoolId);
    return this.service.assign(feePlanId, dto, {
      userId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
