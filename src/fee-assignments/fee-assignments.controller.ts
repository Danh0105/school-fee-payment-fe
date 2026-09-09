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
import { FeeAssignmentsService } from './fee-assignments.service';
import { CreateFeeAssignmentDto } from './dto/create-fee-assignment.dto';

@ApiTags('Fee Plans')
@ApiBearerAuth()
@Controller('fee-plans/:id/assign')
export class FeeAssignmentsController {
  constructor(private readonly service: FeeAssignmentsService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  assign(
    @Param('id', ParseUUIDPipe) feePlanId: string,
    @Body() dto: CreateFeeAssignmentDto,
    @CurrentUser('id') userId: string,
    @Req() req: Request,
  ) {
    return this.service.assign(feePlanId, dto, {
      userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
