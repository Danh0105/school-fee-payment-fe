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
import { ImportsService } from './imports.service';
import { PreviewImportDto } from './dto/preview-import.dto';
import { ConfirmImportDto } from './dto/confirm-import.dto';
import { ImportSessionType } from './entities/import-session.entity';

@ApiTags('Imports')
@ApiBearerAuth()
@Controller('imports')
export class ImportsController {
  constructor(private readonly service: ImportsService) {}

  @Post('excel/preview')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  preview(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: PreviewImportDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.preview(file, dto, { userId });
  }

  @Post('excel/confirm')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  confirm(
    @Body() dto: ConfirmImportDto,
    @CurrentUser('id') userId: string,
    @Req() req: Request,
  ) {
    return this.service.confirm(dto.importSessionId, {
      userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('students')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  previewStudents(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: PreviewImportDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.preview(
      file,
      { ...dto, type: ImportSessionType.STUDENTS },
      { userId },
    );
  }

  @Post('receivables')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  previewReceivables(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: PreviewImportDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.preview(
      file,
      { ...dto, type: ImportSessionType.RECEIVABLES },
      { userId },
    );
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id);
  }
}
