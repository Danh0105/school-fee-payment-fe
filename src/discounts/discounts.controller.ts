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
import { DiscountsService } from './discounts.service';
import { CreateDiscountDto } from './dto/create-discount.dto';

@ApiTags('Receivables')
@ApiBearerAuth()
@Controller('receivables/:id/discount')
export class DiscountsController {
  constructor(private readonly service: DiscountsService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  create(
    @Param('id', ParseUUIDPipe) receivableId: string,
    @Body() dto: CreateDiscountDto,
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
