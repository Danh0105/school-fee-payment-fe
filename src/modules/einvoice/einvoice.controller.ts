import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { createReadStream } from 'fs';
import { AccessControlService } from '../../access-control/access-control.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { CancelEInvoiceDto } from './dto/cancel-einvoice.dto';
import { QueryEInvoiceDto } from './dto/query-einvoice.dto';
import { UpsertEInvoiceConfigDto } from './dto/upsert-einvoice-config.dto';
import { EInvoiceService } from './einvoice.service';

@ApiTags('E-Invoices')
@ApiBearerAuth()
@Controller('einvoices')
export class EInvoiceController {
  constructor(
    private readonly service: EInvoiceService,
    private readonly access: AccessControlService,
  ) {}

  @Get()
  async findAll(
    @Query() query: QueryEInvoiceDto,
    @CurrentUser() user: AuthUser,
  ) {
    const schools = await this.access.resolveSchoolFilter(user, query.schoolId);
    return this.service.findAll(query, schools);
  }

  @Get('provider-status')
  providerStatus() {
    return this.service.getProviderStatus();
  }

  @Post('receipts/:receiptId/issue')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async issueForReceipt(
    @Param('receiptId', ParseUUIDPipe) receiptId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const receipt = await this.service.findReceipt(receiptId);
    if (!receipt) throw new NotFoundException('Không tìm thấy phiếu thu');
    await this.access.assertSchoolAccess(user, receipt.schoolId);
    return this.service.issueForReceipt(receiptId);
  }

  @Get('config/:schoolId')
  async getConfig(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.access.assertSchoolAccess(user, schoolId);
    return this.service.getConfig(schoolId);
  }

  @Put('config/:schoolId')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async upsertConfig(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: UpsertEInvoiceConfigDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.access.assertSchoolAccess(user, schoolId);
    return this.service.upsertConfig(schoolId, dto);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const invoice = await this.service.findDetail(id);
    if (!invoice) throw new NotFoundException('Không tìm thấy hóa đơn');
    await this.access.assertSchoolAccess(user, invoice.schoolId);
    return invoice;
  }

  @Post(':id/retry')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async retry(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.assertAccess(id, user);
    await this.service.retry(id);
    return { queued: true };
  }

  @Post(':id/sync')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async sync(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.assertAccess(id, user);
    await this.service.sync(id);
    return { queued: true };
  }

  @Post(':id/send-email')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async sendEmail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.assertAccess(id, user);
    await this.service.sendEmail(id);
    return { queued: true };
  }

  @Post(':id/cancel')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelEInvoiceDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.assertAccess(id, user);
    await this.service.cancel(id, dto.reason);
    return { cancelled: true };
  }

  @Get(':id/pdf')
  @RawResponse()
  pdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return this.file(id, 'pdf', user, response);
  }

  @Get(':id/zip')
  @RawResponse()
  zip(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return this.file(id, 'zip', user, response);
  }

  @Get(':id/xml')
  @RawResponse()
  async xml(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    await this.assertAccess(id, user);
    const xml = await this.service.getXml(id);
    if (!xml) {
      await this.service.requestFile(id, 'ZIP');
      throw new NotFoundException(
        'File chưa sẵn sàng; yêu cầu tải đã được đưa vào hàng đợi',
      );
    }
    response.setHeader('Content-Type', 'application/xml');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${xml.fileName}"`,
    );
    return new StreamableFile(xml.content);
  }

  private async file(
    id: string,
    type: string,
    user: AuthUser,
    response: Response,
  ): Promise<StreamableFile> {
    await this.assertAccess(id, user);
    const file = await this.service.getFile(id, type);
    if (!file) {
      await this.service.requestFile(id, type.toUpperCase() as 'PDF' | 'ZIP');
      throw new NotFoundException(
        'File chưa sẵn sàng; yêu cầu tải đã được đưa vào hàng đợi',
      );
    }
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );
    return new StreamableFile(createReadStream(file.storagePath));
  }

  private async assertAccess(id: string, user: AuthUser): Promise<void> {
    const invoice = await this.service.findById(id);
    if (!invoice) throw new NotFoundException('Không tìm thấy hóa đơn');
    await this.access.assertSchoolAccess(user, invoice.schoolId);
  }
}
