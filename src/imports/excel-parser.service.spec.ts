import ExcelJS from 'exceljs';
import { ExcelParserService } from './excel-parser.service';

describe('ExcelParserService student contact columns', () => {
  it('reads parent contact fields and converts an Excel date to ISO', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Dữ liệu import');
    sheet.addRow([
      'TÊN HS',
      'NGÀY SINH',
      'GIỚI TÍNH',
      'TÊN PHỤ HUYNH',
      'SĐT PHỤ HUYNH',
      'EMAIL PHỤ HUYNH',
      'TRẠNG THÁI',
      'LỚP',
    ]);
    sheet.addRow([
      'Nguyễn Văn A',
      new Date(Date.UTC(2015, 7, 15)),
      'Nữ',
      'Nguyễn Văn B',
      '0901234567',
      'phuhuynh@example.com',
      'Đang học',
      '1A1',
    ]);
    sheet.getColumn(2).numFmt = 'dd/mm/yyyy';

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const rows = await new ExcelParserService().parse(buffer);

    expect(rows).toEqual([
      {
        sheet: 'Dữ liệu import',
        rowNumber: 2,
        values: {
          fullName: 'Nguyễn Văn A',
          dateOfBirth: '2015-08-15',
          gender: 'Nữ',
          parentName: 'Nguyễn Văn B',
          parentPhone: '0901234567',
          parentEmail: 'phuhuynh@example.com',
          status: 'Đang học',
          classCode: '1A1',
        },
      },
    ]);
  });

  it('reads school and academic-year information from the bootstrap sheet', async () => {
    const workbook = new ExcelJS.Workbook();
    const dataSheet = workbook.addWorksheet('Dữ liệu import');
    dataSheet.addRow(['TÊN HS', 'TÊN LỚP']);
    dataSheet.addRow(['Nguyễn Văn A', 'Lớp 1A1']);
    const schoolSheet = workbook.addWorksheet('Thông tin trường');
    schoolSheet.addRow([
      'TÊN TRƯỜNG',
      'SĐT TRƯỜNG',
      'NĂM HỌC',
      'NGÀY BẮT ĐẦU',
      'NGÀY KẾT THÚC',
    ]);
    schoolSheet.addRow([
      'Trường Tiểu học A',
      '0901234567',
      '2026-2027',
      new Date(Date.UTC(2026, 8, 1)),
      new Date(Date.UTC(2027, 7, 31)),
    ]);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const parsed = await new ExcelParserService().parseWorkbook(buffer);

    expect(parsed.schoolInfo).toMatchObject({
      code: '',
      name: 'Trường Tiểu học A',
      phone: '0901234567',
      academicYearName: '2026-2027',
      academicYearStartDate: '2026-09-01',
      academicYearEndDate: '2027-08-31',
    });
    expect(parsed.rows[0].values).toMatchObject({
      fullName: 'Nguyễn Văn A',
      className: 'Lớp 1A1',
    });
  });

  it('recognizes the Võ Thị Sáu bulk QR column names from a class sheet', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Ghi chú').addRow(['Không phải dữ liệu']);
    const sheet = workbook.addWorksheet('3A4');
    sheet.addRow([
      'STT',
      'Họ và tên',
      'Ngày sinh (dd/mm/yyyy)',
      'SĐT phụ huynh',
      'Mã định danh CCCD',
      'Số tiền (VND)',
      'Nội dung chuyển khoản',
    ]);
    sheet.addRow([
      1,
      'Phan Dương Linh Đan',
      '21/09/2018',
      '0358228913',
      '072318004706',
      560000,
      'HV072318004706 THVTS Lớp 3A4 Phan Dương Linh Đan',
    ]);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const rows = await new ExcelParserService().parse(buffer, '3A4');

    expect(rows).toEqual([
      {
        sheet: '3A4',
        rowNumber: 2,
        values: {
          fullName: 'Phan Dương Linh Đan',
          dateOfBirth: '21/09/2018',
          parentPhone: '0358228913',
          identifierCode: '072318004706',
          paymentAmount: '560000',
          legacyTransferContent:
            'HV072318004706 THVTS Lớp 3A4 Phan Dương Linh Đan',
          classCode: '3A4',
          className: '3A4',
        },
      },
    ]);
  });

  it('recognizes all eight invoice fields in a collection list', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Tổng hợp');
    sheet.addRow([
      'Họ và tên',
      'Lớp',
      'Mã định danh',
      'Số tiền',
      'Họ tên người mua hàng',
      'Địa chỉ người mua',
      'CCCD người mua',
      'Tên hàng hóa, dịch vụ',
      'Đơn vị tính',
      'Số lượng',
      'Đơn giá',
      'Thành tiền',
    ]);
    sheet.addRow([
      'Phạm Bảo Lộc',
      '1A1',
      '072220003363',
      560000,
      'Nguyễn Văn A',
      'Lớp 1A1, Trường TH Demo',
      '072220003363',
      'Chương trình AI và STEM năm học 2026-2027 (7 tháng)',
      'Học sinh',
      1,
      560000,
      560000,
    ]);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const [row] = await new ExcelParserService().parse(buffer, 'Tổng hợp');

    expect(row.values).toMatchObject({
      paymentAmount: '560000',
      buyerName: 'Nguyễn Văn A',
      buyerAddress: 'Lớp 1A1, Trường TH Demo',
      buyerIdNo: '072220003363',
      serviceName: 'Chương trình AI và STEM năm học 2026-2027 (7 tháng)',
      unitName: 'Học sinh',
      quantity: '1',
      unitPrice: '560000',
      originalAmount: '560000',
    });
  });

  it('preserves a leading zero from a numeric identifier display format', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('3A4');
    sheet.addRow(['Họ và tên', 'Mã định danh', 'Số tiền']);
    sheet.addRow(['Nguyễn Văn A', 72318004706, 560000]);
    sheet.getCell('B2').numFmt = '000000000000';

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const [row] = await new ExcelParserService().parse(buffer, '3A4');

    expect(row.values.identifierCode).toBe('072318004706');
  });

  it('reads the list from a later sheet when the first tab has no headers', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Sheet2', { state: 'hidden' });
    workbook.addWorksheet('Tổng hợp').addRow(['Lớp 1A1', 35]);
    const sheet = workbook.addWorksheet('DS hóa đơn');
    sheet.addRow(['TT', 'Họ và tên', 'Lớp', 'Mã định danh', 'Số tiền']);
    sheet.addRow([1, 'Phạm Bảo Lộc', '1A1', '072220003363', 560000]);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const rows = await new ExcelParserService().parse(buffer);

    expect(rows).toEqual([
      {
        sheet: 'DS hóa đơn',
        rowNumber: 2,
        values: {
          fullName: 'Phạm Bảo Lộc',
          classCode: '1A1',
          identifierCode: '072220003363',
          paymentAmount: '560000',
        },
      },
    ]);
  });

  it('names the sheets it read when no header is recognized', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Sheet1').addRow(['Hä vµ tªn', 'Líp']);
    workbook.addWorksheet('Hướng dẫn').addRow(['HỌ VÀ TÊN', 'LỚP']);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    await expect(new ExcelParserService().parse(buffer)).rejects.toThrow(
      'đã đọc sheet “Sheet1”',
    );
  });
});
