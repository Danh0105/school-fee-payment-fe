import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { ImportSessionType } from './entities/import-session.entity';

interface TemplateColumn {
  header: string;
  key: string;
  width: number;
}

const STUDENT_COLUMNS: TemplateColumn[] = [
  { header: 'MÃ ĐỊNH DANH / CCCD', key: 'identifierCode', width: 24 },
  { header: 'TÊN HS', key: 'fullName', width: 28 },
  { header: 'NGÀY SINH', key: 'dateOfBirth', width: 16 },
  { header: 'GIỚI TÍNH', key: 'gender', width: 16 },
  { header: 'ĐỊA CHỈ', key: 'address', width: 32 },
  { header: 'SỐ ĐT', key: 'phone', width: 18 },
  { header: 'TÊN PHỤ HUYNH', key: 'parentName', width: 28 },
  { header: 'SĐT PHỤ HUYNH', key: 'parentPhone', width: 20 },
  { header: 'EMAIL PHỤ HUYNH', key: 'parentEmail', width: 28 },
  { header: 'TRẠNG THÁI', key: 'status', width: 20 },
  { header: 'TÊN LỚP', key: 'className', width: 24 },
];

const RECEIVABLE_COLUMNS: TemplateColumn[] = [
  { header: 'SỐ LƯỢNG (THÁNG)', key: 'quantity', width: 22 },
  { header: 'ĐƠN GIÁ', key: 'unitPrice', width: 18 },
];

const RECEIVABLE_STUDENT_COLUMNS: TemplateColumn[] = [
  { header: 'MÃ HS', key: 'studentCode', width: 20 },
  { header: 'TÊN HS', key: 'fullName', width: 28 },
  { header: 'LỚP', key: 'classCode', width: 14 },
];

export interface ImportTemplateFile {
  buffer: Buffer;
  fileName: string;
}

@Injectable()
export class ImportTemplateService {
  async create(type: ImportSessionType): Promise<ImportTemplateFile> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'School Fee Payment';
    workbook.created = new Date();

    const dataSheet = workbook.addWorksheet('Dữ liệu import', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    const columns: TemplateColumn[] =
      type === ImportSessionType.STUDENTS
        ? STUDENT_COLUMNS
        : type === ImportSessionType.RECEIVABLES
          ? [...RECEIVABLE_STUDENT_COLUMNS, ...RECEIVABLE_COLUMNS]
          : [...STUDENT_COLUMNS, ...RECEIVABLE_COLUMNS];
    dataSheet.columns = columns.map((column) => ({ ...column }));
    const columnKeys = new Set<string>(columns.map((column) => column.key));
    dataSheet.autoFilter = {
      from: 'A1',
      to: dataSheet.getCell(1, columns.length).address,
    };

    const header = dataSheet.getRow(1);
    header.height = 28;
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.alignment = { vertical: 'middle', horizontal: 'center' };
    header.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF078247' },
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFB7D5C8' } },
        left: { style: 'thin', color: { argb: 'FFB7D5C8' } },
        bottom: { style: 'thin', color: { argb: 'FFB7D5C8' } },
        right: { style: 'thin', color: { argb: 'FFB7D5C8' } },
      };
    });

    for (const key of [
      'studentCode',
      'identifierCode',
      'phone',
      'parentPhone',
      'classCode',
    ]) {
      if (!columnKeys.has(key)) continue;
      const column = dataSheet.getColumn(key);
      column.numFmt = '@';
    }
    if (columnKeys.has('dateOfBirth'))
      dataSheet.getColumn('dateOfBirth').numFmt = 'dd/mm/yyyy';

    this.addListValidation(dataSheet, columnKeys, 'gender', [
      'Nam',
      'Nữ',
      'Khác',
    ]);
    this.addListValidation(dataSheet, columnKeys, 'status', [
      'Đang học',
      'Ngừng học',
      'Đã tốt nghiệp',
      'Đã chuyển trường',
    ]);

    if (columnKeys.has('quantity')) {
      const quantityColumn = dataSheet.getColumn('quantity');
      for (let row = 2; row <= 1000; row += 1) {
        dataSheet.getCell(row, quantityColumn.number).dataValidation = {
          type: 'decimal',
          operator: 'greaterThan',
          allowBlank: false,
          formulae: [0],
          showErrorMessage: true,
          errorTitle: 'Số lượng không hợp lệ',
          error: 'Số lượng phải lớn hơn 0.',
        };
      }
    }

    if (columnKeys.has('unitPrice')) {
      const unitPriceColumn = dataSheet.getColumn('unitPrice');
      unitPriceColumn.numFmt = '#,##0';
      for (let row = 2; row <= 1000; row += 1) {
        dataSheet.getCell(row, unitPriceColumn.number).dataValidation = {
          type: 'decimal',
          operator: 'greaterThan',
          allowBlank: false,
          formulae: [0],
          showErrorMessage: true,
          errorTitle: 'Đơn giá không hợp lệ',
          error: 'Đơn giá phải lớn hơn 0.',
        };
      }
    }

    if (type !== ImportSessionType.RECEIVABLES) {
      this.addSchoolInfo(workbook);
    }
    this.addInstructions(workbook, type);

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      fileName: this.fileName(type),
    };
  }

  private addSchoolInfo(workbook: ExcelJS.Workbook): void {
    const sheet = workbook.addWorksheet('Thông tin trường', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    sheet.columns = [
      { header: 'TÊN TRƯỜNG', key: 'name', width: 32 },
      { header: 'ĐỊA CHỈ TRƯỜNG', key: 'address', width: 38 },
      { header: 'SĐT TRƯỜNG', key: 'phone', width: 18 },
      { header: 'MÃ SỐ THUẾ', key: 'taxCode', width: 18 },
      { header: 'NGƯỜI QUẢN LÝ', key: 'managerInfo', width: 24 },
      {
        header: 'KINH DOANH PHỤ TRÁCH',
        key: 'salesRepresentative',
        width: 26,
      },
      { header: 'NĂM HỌC', key: 'academicYearName', width: 16 },
      { header: 'NGÀY BẮT ĐẦU', key: 'academicYearStartDate', width: 18 },
      { header: 'NGÀY KẾT THÚC', key: 'academicYearEndDate', width: 18 },
    ];
    sheet.autoFilter = {
      from: 'A1',
      to: sheet.getCell(1, sheet.columnCount).address,
    };

    const header = sheet.getRow(1);
    header.height = 30;
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    header.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0F766E' },
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF99F6E4' } },
        left: { style: 'thin', color: { argb: 'FF99F6E4' } },
        bottom: { style: 'thin', color: { argb: 'FF99F6E4' } },
        right: { style: 'thin', color: { argb: 'FF99F6E4' } },
      };
    });

    for (const key of ['phone', 'taxCode']) {
      sheet.getColumn(key).numFmt = '@';
    }
    sheet.getColumn('academicYearStartDate').numFmt = 'dd/mm/yyyy';
    sheet.getColumn('academicYearEndDate').numFmt = 'dd/mm/yyyy';
  }

  private addListValidation(
    sheet: ExcelJS.Worksheet,
    columnKeys: Set<string>,
    key: string,
    values: string[],
  ): void {
    if (!columnKeys.has(key)) return;
    const column = sheet.getColumn(key);
    for (let row = 2; row <= 1000; row += 1) {
      sheet.getCell(row, column.number).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${values.join(',')}"`],
        showErrorMessage: true,
        errorTitle: 'Giá trị không hợp lệ',
        error: `Chọn một trong các giá trị: ${values.join(', ')}.`,
      };
    }
  }

  private addInstructions(
    workbook: ExcelJS.Workbook,
    type: ImportSessionType,
  ): void {
    const sheet = workbook.addWorksheet('Hướng dẫn');
    sheet.columns = [
      { key: 'item', width: 24 },
      { key: 'detail', width: 86 },
    ];
    sheet.addRow(['HƯỚNG DẪN SỬ DỤNG FILE MẪU']);
    sheet.mergeCells('A1:B1');
    sheet.getCell('A1').font = {
      bold: true,
      size: 14,
      color: { argb: 'FFFFFFFF' },
    };
    sheet.getCell('A1').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF078247' },
    };
    sheet.getCell('A1').alignment = { horizontal: 'center' };
    sheet.addRows([
      ['Loại import', this.typeLabel(type)],
      [
        'Cách nhập',
        'Nhập dữ liệu từ dòng 2 trong sheet “Dữ liệu import”; không đổi tên hoặc thứ tự các cột.',
      ],
      ['Cột bắt buộc', this.requiredColumns(type)],
      [
        'Thông tin trường',
        type === ImportSessionType.RECEIVABLES
          ? 'Sử dụng trường và năm học đã có trên hệ thống.'
          : 'Điền một dòng duy nhất (dòng 2) trong sheet “Thông tin trường”. Hệ thống sẽ tự tạo trường, năm học và các lớp chưa tồn tại khi xác nhận import.',
      ],
      [
        'Ngày sinh',
        'Nhập theo định dạng DD/MM/YYYY hoặc YYYY-MM-DD. Cần có ngày sinh và SĐT phụ huynh để đăng nhập Cổng phụ huynh.',
      ],
      [
        'Mã học sinh',
        type === ImportSessionType.RECEIVABLES
          ? 'Bắt buộc và phải tồn tại trong hệ thống.'
          : 'Không có trong file mẫu; hệ thống tự sinh mã khi tạo học sinh mới.',
      ],
      [
        'Số điện thoại',
        'Định dạng các cột số điện thoại là Text để giữ số 0 ở đầu.',
      ],
      [
        'Thông tin học sinh',
        'File gồm: mã định danh, họ tên, ngày sinh, giới tính, địa chỉ, số điện thoại, thông tin phụ huynh, trạng thái và tên lớp. Mã học sinh và mã lớp được tự sinh.',
      ],
      [
        'Lưu ý',
        'Xóa các dòng trống hoặc dữ liệu minh họa trước khi tải file lên. Luôn kiểm tra kết quả preview trước khi xác nhận import.',
      ],
    ]);
    sheet.eachRow((row, rowNumber) => {
      row.alignment = { vertical: 'top', wrapText: true };
      if (rowNumber > 1) row.getCell(1).font = { bold: true };
    });
  }

  private typeLabel(type: ImportSessionType): string {
    if (type === ImportSessionType.STUDENTS) return 'Chỉ học sinh';
    if (type === ImportSessionType.RECEIVABLES) return 'Chỉ công nợ';
    return 'Học sinh & công nợ';
  }

  private requiredColumns(type: ImportSessionType): string {
    if (type === ImportSessionType.STUDENTS)
      return 'Sheet Thông tin trường: TÊN TRƯỜNG, NĂM HỌC, NGÀY BẮT ĐẦU, NGÀY KẾT THÚC. Sheet Dữ liệu import: TÊN HS, TÊN LỚP';
    if (type === ImportSessionType.RECEIVABLES)
      return 'MÃ HS, TÊN HS, LỚP, SỐ LƯỢNG (THÁNG), ĐƠN GIÁ';
    return 'Thông tin trường/năm học; TÊN HS, TÊN LỚP, SỐ LƯỢNG (THÁNG), ĐƠN GIÁ';
  }

  private fileName(type: ImportSessionType): string {
    if (type === ImportSessionType.STUDENTS)
      return 'mau-import-khoi-tao-truong-hoc-sinh.xlsx';
    if (type === ImportSessionType.RECEIVABLES)
      return 'mau-import-cong-no.xlsx';
    return 'mau-import-hoc-sinh-cong-no.xlsx';
  }
}
