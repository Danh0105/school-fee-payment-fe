import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AccessControlService } from '../access-control/access-control.service';
import { ImportsService } from './imports.service';
import { PreviewImportDto } from './dto/preview-import.dto';
import { ConfirmImportDto } from './dto/confirm-import.dto';
import { ImportSessionType } from './entities/import-session.entity';
import { ImportTemplateService } from './import-template.service';
import { ImportSession } from './entities/import-session.entity';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { RawResponse } from '../common/decorators/raw-response.decorator';
import { ImportPaymentQrPdfService } from './import-payment-qr-pdf.service';

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('Imports')
@ApiBearerAuth()
@Controller('imports')
export class ImportsController {
  constructor(
    private readonly service: ImportsService,
    private readonly accessControlService: AccessControlService,
    private readonly templateService: ImportTemplateService,
    private readonly paymentQrPdfService: ImportPaymentQrPdfService,
  ) {}

  @Get('excel/template')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async downloadTemplate(
    @Query('type', new ParseEnumPipe(ImportSessionType))
    type: ImportSessionType,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.templateService.create(type);
    res.set({
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="${file.fileName}"`,
    });
    res.send(file.buffer);
  }

  @Post('excel/preview')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async preview(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: PreviewImportDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (dto.schoolId) {
      await this.accessControlService.assertSchoolAccess(user, dto.schoolId);
    }
    return this.service.preview(file, dto, user);
  }

  @Post('excel/confirm')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async confirm(
    @Body() dto: ConfirmImportDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const session = await this.service.findById(dto.importSessionId);
    await this.assertSessionAccess(user, session);
    return this.service.confirm(dto.importSessionId, {
      userId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('students')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async previewStudents(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: PreviewImportDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (dto.schoolId) {
      await this.accessControlService.assertSchoolAccess(user, dto.schoolId);
    }
    return this.service.preview(
      file,
      { ...dto, type: ImportSessionType.STUDENTS },
      user,
    );
  }

  @Post('receivables')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async previewReceivables(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: PreviewImportDto,
    @CurrentUser() user: AuthUser,
  ) {
    if (dto.schoolId) {
      await this.accessControlService.assertSchoolAccess(user, dto.schoolId);
    }
    return this.service.preview(
      file,
      { ...dto, type: ImportSessionType.RECEIVABLES },
      user,
    );
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const session = await this.service.findById(id);
    await this.assertSessionAccess(user, session);
    return session;
  }

  @Get(':id/payment-qr.pdf')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  @ApiProduces('application/pdf')
  @RawResponse()
  async downloadPaymentQrPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    const session = await this.service.findById(id);
    await this.assertSessionAccess(user, session);
    const buffer = await this.paymentQrPdfService.create(session);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': buffer.length.toString(),
      'Content-Disposition': `attachment; filename="ma-qr-thanh-toan-${id}.pdf"`,
    });
    res.send(buffer);
  }

  private async assertSessionAccess(
    user: AuthUser,
    session: ImportSession,
  ): Promise<void> {
    if (!session.bootstrapContext?.createSchool) {
      await this.accessControlService.assertSchoolAccess(
        user,
        session.schoolId,
      );
      return;
    }
    const canCreate =
      (user.role === Role.SUPER_ADMIN || user.role === Role.ADMIN) &&
      !user.schoolId &&
      (!user.companyId ||
        user.companyId === session.bootstrapContext.companyId);
    if (!canCreate) {
      throw AppException.forbidden(ErrorCode.SCHOOL_OUT_OF_SCOPE);
    }
  }
}
