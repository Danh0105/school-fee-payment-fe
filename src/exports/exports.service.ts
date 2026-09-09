import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { ReportsService } from '../reports/reports.service';
import { ReportFilterDto } from '../reports/dto/report-filter.dto';

@Injectable()
export class ExportsService {
  constructor(private readonly reportsService: ReportsService) {}

  private async workbookToBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  async exportReceivables(
    filter: ReportFilterDto,
    scopedIds?: string[] | null,
  ): Promise<Buffer> {
    const { data } = await this.reportsService.listReceivableRows(
      filter,
      { page: 1, limit: 10000, skip: 0 },
      scopedIds,
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Công nợ');
    sheet.columns = [
      { header: 'Mã công nợ', key: 'code', width: 16 },
      { header: 'Mã HS', key: 'studentCode', width: 16 },
      { header: 'Tên HS', key: 'fullName', width: 28 },
      { header: 'Khoản thu', key: 'feePlan', width: 28 },
      { header: 'Phải thu', key: 'amountDue', width: 16 },
      { header: 'Đã thu', key: 'amountPaid', width: 16 },
      { header: 'Còn nợ', key: 'amountOutstanding', width: 16 },
      { header: 'Trạng thái', key: 'status', width: 16 },
    ];
    for (const r of data) {
      sheet.addRow({
        code: r.receivableCode,
        studentCode: r.student.studentCode,
        fullName: r.student.fullName,
        feePlan: r.feePlan.name,
        amountDue: r.amountDue.toFixed(2),
        amountPaid: r.amountPaid.toFixed(2),
        amountOutstanding: r.amountOutstanding.toFixed(2),
        status: r.status,
      });
    }
    sheet.getRow(1).font = { bold: true };

    return this.workbookToBuffer(workbook);
  }

  async exportPayments(
    filter: ReportFilterDto,
    scopedIds?: string[] | null,
  ): Promise<Buffer> {
    const summary = await this.reportsService.paymentsReport(filter, scopedIds);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Thanh toán');
    sheet.columns = [
      { header: 'Chỉ tiêu', key: 'label', width: 30 },
      { header: 'Giá trị', key: 'value', width: 20 },
    ];
    sheet.addRow({
      label: 'Tổng số giao dịch',
      value: summary.transactionCount,
    });
    sheet.addRow({ label: 'Tổng tiền đã nhận', value: summary.totalAmount });
    sheet.getRow(1).font = { bold: true };

    return this.workbookToBuffer(workbook);
  }

  async exportDebtReport(
    filter: ReportFilterDto,
    scopedIds?: string[] | null,
  ): Promise<Buffer> {
    const report = await this.reportsService.receivablesReport(
      filter,
      scopedIds,
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Báo cáo công nợ');
    sheet.columns = [
      { header: 'Chỉ tiêu', key: 'label', width: 32 },
      { header: 'Giá trị', key: 'value', width: 20 },
    ];
    sheet.addRows([
      { label: 'Tổng phải thu', value: report.totalReceivable },
      { label: 'Tổng miễn giảm', value: report.totalDiscount },
      { label: 'Tổng điều chỉnh tăng', value: report.totalAdjustmentIncrease },
      { label: 'Tổng điều chỉnh giảm', value: report.totalAdjustmentDecrease },
      { label: 'Thực phải thu', value: report.totalDue },
      { label: 'Đã thu', value: report.totalPaid },
      { label: 'Còn phải thu', value: report.totalOutstanding },
      { label: 'Số học sinh đã đóng', value: report.studentsPaid },
      { label: 'Số học sinh chưa đóng', value: report.studentsUnpaid },
      { label: 'Số học sinh đóng một phần', value: report.studentsPartial },
      { label: 'Tỷ lệ thu (%)', value: report.collectionRate },
    ]);
    sheet.getRow(1).font = { bold: true };
    sheet.getColumn('label').font = { bold: true };

    return this.workbookToBuffer(workbook);
  }

  async exportClass(classId: string): Promise<Buffer> {
    const report = await this.reportsService.classReport(classId);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(report.className.slice(0, 31));
    sheet.addRow([`Lớp: ${report.className}`]);
    sheet.addRow([`Sĩ số: ${report.studentCount}`]);
    sheet.addRow([`Tổng phải thu: ${report.totalDue}`]);
    sheet.addRow([`Đã thu: ${report.totalPaid}`]);
    sheet.addRow([`Còn nợ: ${report.totalOutstanding}`]);
    sheet.addRow([`Tỷ lệ thu: ${report.collectionRate}%`]);
    sheet.addRow([]);

    const headerRow = sheet.addRow([
      'Mã HS',
      'Tên HS',
      'Phải thu',
      'Đã thu',
      'Còn nợ',
      'Trạng thái',
    ]);
    headerRow.font = { bold: true };

    for (const s of report.students) {
      sheet.addRow([
        s.studentCode,
        s.fullName,
        s.amountDue,
        s.amountPaid,
        s.amountOutstanding,
        s.status,
      ]);
    }
    sheet.columns.forEach((col) => {
      col.width = 20;
    });

    return this.workbookToBuffer(workbook);
  }
}
