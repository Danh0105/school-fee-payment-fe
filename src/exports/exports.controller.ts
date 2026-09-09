import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { AccessControlService } from '../access-control/access-control.service';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { Class } from '../classes/entities/class.entity';
import { ExportsService } from './exports.service';
import { ReportFilterDto } from '../reports/dto/report-filter.dto';

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('Exports')
@ApiBearerAuth()
@Controller('exports')
export class ExportsController {
  constructor(
    private readonly service: ExportsService,
    private readonly accessControlService: AccessControlService,
    @InjectRepository(Class)
    private readonly classRepo: Repository<Class>,
  ) {}

  private send(res: Response, filename: string, buffer: Buffer): void {
    res.set({
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(buffer);
  }

  @Get('receivables.xlsx')
  async receivables(
    @Query() filter: ReportFilterDto,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const scopedIds = await this.accessControlService.resolveSchoolFilter(
      user,
      filter.schoolId,
    );
    const buffer = await this.service.exportReceivables(filter, scopedIds);
    this.send(res, 'cong-no.xlsx', buffer);
  }

  @Get('payments.xlsx')
  async payments(
    @Query() filter: ReportFilterDto,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const scopedIds = await this.accessControlService.resolveSchoolFilter(
      user,
      filter.schoolId,
    );
    const buffer = await this.service.exportPayments(filter, scopedIds);
    this.send(res, 'thanh-toan.xlsx', buffer);
  }

  @Get('debt-report.xlsx')
  async debtReport(
    @Query() filter: ReportFilterDto,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const scopedIds = await this.accessControlService.resolveSchoolFilter(
      user,
      filter.schoolId,
    );
    const buffer = await this.service.exportDebtReport(filter, scopedIds);
    this.send(res, 'bao-cao-cong-no.xlsx', buffer);
  }

  @Get('class/:id.xlsx')
  async classExport(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const klass = await this.classRepo.findOne({ where: { id } });
    if (!klass) throw AppException.notFound(ErrorCode.CLASS_NOT_FOUND);
    await this.accessControlService.assertSchoolAccess(user, klass.schoolId);
    const buffer = await this.service.exportClass(id);
    this.send(res, `lop-${id}.xlsx`, buffer);
  }
}
