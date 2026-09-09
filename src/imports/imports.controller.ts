import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AccessControlService } from '../access-control/access-control.service';
import { ImportsService } from './imports.service';
import { PreviewImportDto } from './dto/preview-import.dto';
import { ConfirmImportDto } from './dto/confirm-import.dto';
import { ImportSessionType } from './entities/import-session.entity';

@ApiTags('Imports')
@ApiBearerAuth()
@Controller('imports')
export class ImportsController {
  constructor(
    private readonly service: ImportsService,
    private readonly accessControlService: AccessControlService,
  ) {}

  @Post('excel/preview')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async preview(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: PreviewImportDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.accessControlService.assertSchoolAccess(user, dto.schoolId);
    return this.service.preview(file, dto, { userId: user.id });
  }

  @Post('excel/confirm')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async confirm(
    @Body() dto: ConfirmImportDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const session = await this.service.findById(dto.importSessionId);
    await this.accessControlService.assertSchoolAccess(user, session.schoolId);
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
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: PreviewImportDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.accessControlService.assertSchoolAccess(user, dto.schoolId);
    return this.service.preview(
      file,
      { ...dto, type: ImportSessionType.STUDENTS },
      { userId: user.id },
    );
  }

  @Post('receivables')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async previewReceivables(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: PreviewImportDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.accessControlService.assertSchoolAccess(user, dto.schoolId);
    return this.service.preview(
      file,
      { ...dto, type: ImportSessionType.RECEIVABLES },
      { userId: user.id },
    );
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const session = await this.service.findById(id);
    await this.accessControlService.assertSchoolAccess(user, session.schoolId);
    return session;
  }
}
