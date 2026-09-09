import {
  Body,
  Controller,
  Get,
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
import { AdjustmentsService } from './adjustments.service';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';

@ApiTags('Receivables')
@ApiBearerAuth()
@Controller('receivables/:id/adjustments')
export class AdjustmentsController {
  constructor(private readonly service: AdjustmentsService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  create(
    @Param('id', ParseUUIDPipe) receivableId: string,
    @Body() dto: CreateAdjustmentDto,
    @CurrentUser('id') userId: string,
    @Req() req: Request,
  ) {
    return this.service.create(receivableId, dto, {
      userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get()
  findAll(@Param('id', ParseUUIDPipe) receivableId: string) {
    return this.service.findByReceivable(receivableId);
  }
}
