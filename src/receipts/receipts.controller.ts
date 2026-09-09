import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { ReceiptsService } from './receipts.service';
import { QueryReceiptDto } from './dto/query-receipt.dto';
import { CancelReceiptDto } from './dto/cancel-receipt.dto';

@ApiTags('Receipts')
@ApiBearerAuth()
@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly service: ReceiptsService) {}

  @Get()
  findAll(@Query() query: QueryReceiptDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id);
  }

  @Patch(':id/cancel')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelReceiptDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.cancel(id, dto.reason, { userId });
  }
}
