import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ExportsService } from './exports.service';
import { ReportFilterDto } from '../reports/dto/report-filter.dto';

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('Exports')
@ApiBearerAuth()
@Controller('exports')
export class ExportsController {
  constructor(private readonly service: ExportsService) {}

  private send(res: Response, filename: string, buffer: Buffer): void {
    res.set({
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(buffer);
  }

  @Get('receivables.xlsx')
  async receivables(@Query() filter: ReportFilterDto, @Res() res: Response) {
    const buffer = await this.service.exportReceivables(filter);
    this.send(res, 'cong-no.xlsx', buffer);
  }

  @Get('payments.xlsx')
  async payments(@Query() filter: ReportFilterDto, @Res() res: Response) {
    const buffer = await this.service.exportPayments(filter);
    this.send(res, 'thanh-toan.xlsx', buffer);
  }

  @Get('debt-report.xlsx')
  async debtReport(@Query() filter: ReportFilterDto, @Res() res: Response) {
    const buffer = await this.service.exportDebtReport(filter);
    this.send(res, 'bao-cao-cong-no.xlsx', buffer);
  }

  @Get('class/:id.xlsx')
  async classExport(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const buffer = await this.service.exportClass(id);
    this.send(res, `lop-${id}.xlsx`, buffer);
  }
}
