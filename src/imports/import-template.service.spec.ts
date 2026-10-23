import ExcelJS from 'exceljs';
import { ImportTemplateService } from './import-template.service';
import { ImportSessionType } from './entities/import-session.entity';

describe('ImportTemplateService', () => {
  const service = new ImportTemplateService();

  it.each([
    [
      ImportSessionType.STUDENTS,
      'mau-import-khoi-tao-truong-hoc-sinh.xlsx',
      [
        'NGÀY SINH',
        'GIỚI TÍNH',
        'SĐT PHỤ HUYNH',
        'EMAIL PHỤ HUYNH',
        'TRẠNG THÁI',
      ],
      ['MÃ HS', 'MÃ LỚP', 'KHỐI', 'SỐ LƯỢNG (THÁNG)', 'ĐƠN GIÁ'],
    ],
    [
      ImportSessionType.RECEIVABLES,
      'mau-import-cong-no.xlsx',
      ['MÃ HS', 'SỐ LƯỢNG (THÁNG)', 'ĐƠN GIÁ'],
      ['NGÀY SINH', 'SĐT PHỤ HUYNH'],
    ],
    [
      ImportSessionType.COMBINED,
      'mau-import-hoc-sinh-cong-no.xlsx',
      [
        'NGÀY SINH',
        'GIỚI TÍNH',
        'SĐT PHỤ HUYNH',
        'EMAIL PHỤ HUYNH',
        'TRẠNG THÁI',
        'SỐ LƯỢNG (THÁNG)',
        'ĐƠN GIÁ',
      ],
      ['MÃ HS', 'MÃ LỚP', 'KHỐI'],
    ],
  ])(
    'creates the correct %s workbook',
    async (type, fileName, includedHeaders, excludedHeaders) => {
      const file = await service.create(type);
      expect(file.fileName).toBe(fileName);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(file.buffer as never);
      expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(
        type === ImportSessionType.RECEIVABLES
          ? ['Dữ liệu import', 'Hướng dẫn']
          : ['Dữ liệu import', 'Thông tin trường', 'Hướng dẫn'],
      );

      const dataSheet = workbook.getWorksheet('Dữ liệu import');
      const headers = (dataSheet?.getRow(1).values as unknown[]).map(String);
      for (const header of includedHeaders) expect(headers).toContain(header);
      for (const header of excludedHeaders)
        expect(headers).not.toContain(header);

      if (type !== ImportSessionType.RECEIVABLES) {
        const schoolSheet = workbook.getWorksheet('Thông tin trường');
        const schoolHeaders = (schoolSheet?.getRow(1).values as unknown[]).map(
          String,
        );
        expect(schoolHeaders).toEqual(
          expect.arrayContaining([
            'TÊN TRƯỜNG',
            'NĂM HỌC',
            'NGÀY BẮT ĐẦU',
            'NGÀY KẾT THÚC',
          ]),
        );
        expect(schoolHeaders).not.toEqual(
          expect.arrayContaining([
            'MÃ TRƯỜNG',
            'TÊN NGÂN HÀNG',
            'MÃ NGÂN HÀNG',
            'SỐ TÀI KHOẢN',
            'TÊN CHỦ TÀI KHOẢN',
            'TRẠNG THÁI TRƯỜNG',
            'TRẠNG THÁI NĂM HỌC',
          ]),
        );
      }
    },
  );
});
