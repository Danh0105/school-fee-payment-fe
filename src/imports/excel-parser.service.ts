import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { toSafeString } from '../common/utils/stringify.util';

export interface RawImportRow {
  sheet: string;
  rowNumber: number;
  values: Record<string, string>;
}

export interface RawSchoolImportInfo {
  code: string;
  name: string;
  address: string;
  phone: string;
  taxCode: string;
  managerInfo: string;
  salesRepresentative: string;
  bankName: string;
  bankCode: string;
  bankAccountNumber: string;
  bankAccountName: string;
  status: string;
  academicYearName: string;
  academicYearStartDate: string;
  academicYearEndDate: string;
  academicYearStatus: string;
}

export interface ParsedImportWorkbook {
  rows: RawImportRow[];
  schoolInfo: RawSchoolImportInfo | null;
  /** Text above the header row, e.g. "DANH SÁCH BỔ SUNG LỚP 3A4 TH VÕ THỊ SÁU". */
  title: string | null;
}

/** A sheet may start with a title block; the header row is searched for here. */
const HEADER_SEARCH_ROWS = 10;

/** Sheets of the import template that never hold import rows. */
const HELPER_SHEETS = ['Thông tin trường', 'Hướng dẫn'];

const COLUMN_ALIASES: Record<string, string> = {
  'MA HS': 'studentCode',
  'MA DINH DANH': 'identifierCode',
  'MA DINH DANH / CCCD': 'identifierCode',
  'MA DINH DANH CCCD': 'identifierCode',
  CCCD: 'identifierCode',
  'TEN HS': 'fullName',
  'HO VA TEN': 'fullName',
  'NGAY SINH': 'dateOfBirth',
  'NGAY SINH (DD/MM/YYYY)': 'dateOfBirth',
  'NGAY/THANG/NAM SINH': 'dateOfBirth',
  'NGAY THANG NAM SINH': 'dateOfBirth',
  'GIOI TINH': 'gender',
  'DIA CHI': 'address',
  'SO DT': 'phone',
  'SO DIEN THOAI': 'phone',
  'TEN PHU HUYNH': 'parentName',
  'HO TEN PHU HUYNH': 'parentName',
  'SDT PHU HUYNH': 'parentPhone',
  'SO DT PHU HUYNH': 'parentPhone',
  'SO DIEN THOAI PHU HUYNH': 'parentPhone',
  'EMAIL PHU HUYNH': 'parentEmail',
  'TRANG THAI': 'status',
  LOP: 'classCode',
  'MA LOP': 'classCode',
  'TEN LOP': 'className',
  KHOI: 'classGrade',
  'SO LUONG': 'quantity',
  'SO LUONG (THANG)': 'quantity',
  'DON GIA': 'unitPrice',
  'THANH TIEN': 'originalAmount',
  'SO TIEN': 'paymentAmount',
  'SO TIEN (VND)': 'paymentAmount',
  'NOI DUNG CHUYEN KHOAN': 'legacyTransferContent',
  'NOI DUNG': 'legacyTransferContent',
  'NOI DUNG THANH TOAN': 'legacyTransferContent',
  'TEN HANG HOA DICH VU': 'serviceName',
  'TEN HANG HOA, DICH VU': 'serviceName',
  'TEN HANG HOA/DICH VU': 'serviceName',
  'DON VI TINH': 'unitName',
  'HO TEN NGUOI MUA HANG': 'buyerName',
  'TEN NGUOI MUA HANG': 'buyerName',
  'DIA CHI NGUOI MUA': 'buyerAddress',
  'DIA CHI NGUOI MUA HANG': 'buyerAddress',
  'CCCD NGUOI MUA': 'buyerIdNo',
  'CCCD NGUOI MUA HANG': 'buyerIdNo',
  'MA DINH DANH NGUOI MUA': 'buyerIdNo',
};

const SCHOOL_COLUMN_ALIASES: Record<string, keyof RawSchoolImportInfo> = {
  'MA TRUONG': 'code',
  'TEN TRUONG': 'name',
  'DIA CHI TRUONG': 'address',
  'SDT TRUONG': 'phone',
  'SO DIEN THOAI TRUONG': 'phone',
  'MA SO THUE': 'taxCode',
  'NGUOI QUAN LY': 'managerInfo',
  'KINH DOANH PHU TRACH': 'salesRepresentative',
  'TEN NGAN HANG': 'bankName',
  'MA NGAN HANG': 'bankCode',
  'SO TAI KHOAN': 'bankAccountNumber',
  'TEN CHU TAI KHOAN': 'bankAccountName',
  'TRANG THAI TRUONG': 'status',
  'NAM HOC': 'academicYearName',
  'NGAY BAT DAU': 'academicYearStartDate',
  'NGAY KET THUC': 'academicYearEndDate',
  'TRANG THAI NAM HOC': 'academicYearStatus',
};

function stripDiacritics(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .trim();
}

function normalizeHeader(header: string): string | null {
  // Headers wrap inside their cells ("NGÀY/THÁNG/NĂ\nM SINH"): drop line
  // breaks inside words, collapse other spacing, tighten around slashes.
  const key = stripDiacritics(header)
    .replace(/(\p{L})\s*\n\s*(\p{L})/gu, '$1$2')
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, '/');
  return COLUMN_ALIASES[key] ?? null;
}

/** "DANH SÁCH BỔ SUNG LỚP 3A4 TH VÕ THỊ SÁU" → "3A4". */
function classFromTitle(title: string | null): string | null {
  const match = title?.match(/\bL[OỚ]P\s+([0-9A-Za-z][0-9A-Za-z.\-/]*)/iu);
  return match ? match[1].toUpperCase() : null;
}

@Injectable()
export class ExcelParserService {
  async parse(buffer: Buffer, sheetName?: string): Promise<RawImportRow[]> {
    return (await this.parseWorkbook(buffer, sheetName)).rows;
  }

  async parseWorkbook(
    buffer: Buffer,
    sheetName?: string,
  ): Promise<ParsedImportWorkbook> {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as never);
    } catch {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_ERROR,
        'File Excel không hợp lệ hoặc bị hỏng',
      );
    }

    const requestedSheetName = sheetName?.trim();
    const sheets = requestedSheetName
      ? [workbook.getWorksheet(requestedSheetName)].filter(
          (sheet): sheet is ExcelJS.Worksheet => Boolean(sheet),
        )
      : this.dataSheetCandidates(workbook);
    if (sheets.length === 0) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_ERROR,
        requestedSheetName
          ? `Không tìm thấy sheet “${requestedSheetName}” trong file Excel`
          : 'File Excel không có sheet dữ liệu',
      );
    }

    // The list is often not the first tab (a hidden or summary sheet comes
    // first), so read the sheet whose header row is recognized best.
    let best = this.findHeader(sheets[0]);
    for (const sheet of sheets.slice(1)) {
      const header = this.findHeader(sheet);
      if (header.columnMap.size > best.columnMap.size) best = header;
    }
    const { worksheet, headerRowNumber, columnMap } = best;
    const title = this.titleAbove(worksheet, headerRowNumber);
    const titleClass = classFromTitle(title);

    if (columnMap.size === 0) {
      const read = sheets.map((sheet) => `“${sheet.name}”`).join(', ');
      throw AppException.badRequest(
        ErrorCode.VALIDATION_ERROR,
        `Không nhận diện được tiêu đề cột nào trong file Excel (đã đọc sheet ${read}). ` +
          'Dòng tiêu đề cần có các cột như HỌ VÀ TÊN, LỚP, MÃ ĐỊNH DANH, SỐ TIỀN.',
      );
    }

    const rows: RawImportRow[] = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= headerRowNumber) return;

      const values: Record<string, string> = {};
      let hasAnyValue = false;
      columnMap.forEach((field, colNumber) => {
        const cell = row.getCell(colNumber);
        const raw = cell.value;
        // For numeric identifiers formatted as 000000000000, ExcelJS's raw
        // value drops the leading zero while cell.text preserves it.
        const text = this.cellText(raw, cell.text, cell.numFmt).trim();
        if (text) hasAnyValue = true;
        values[field] = text;
      });

      // A list titled "... LỚP 3A4 ..." names its class in the title.
      if (!values.classCode && !values.className && titleClass) {
        values.classCode = titleClass;
        values.className = titleClass;
      }

      // Legacy workbooks commonly use one worksheet per class (for example
      // "3A4") and omit a repeated class column from every student row.
      if (
        !values.classCode &&
        !values.className &&
        worksheet.name !== 'Dữ liệu import' &&
        !HELPER_SHEETS.includes(worksheet.name)
      ) {
        values.classCode = worksheet.name.trim();
        values.className = worksheet.name.trim();
      }

      if (hasAnyValue) {
        rows.push({ sheet: worksheet.name, rowNumber, values });
      }
    });

    return {
      rows,
      schoolInfo: this.parseSchoolInfo(workbook),
      title,
    };
  }

  /**
   * Sheets that may hold the import rows when no sheet is named: the
   * template's "Dữ liệu import" alone, else every sheet but the template's
   * helper sheets, visible ones first.
   */
  private dataSheetCandidates(workbook: ExcelJS.Workbook): ExcelJS.Worksheet[] {
    const template = workbook.getWorksheet('Dữ liệu import');
    if (template) return [template];

    const sheets = workbook.worksheets.filter(
      (sheet) => !HELPER_SHEETS.includes(sheet.name),
    );
    return (sheets.length > 0 ? sheets : workbook.worksheets)
      .slice()
      .sort(
        (a, b) => Number(a.state !== 'visible') - Number(b.state !== 'visible'),
      );
  }

  /** The row within the first rows that names the most known columns. */
  private findHeader(worksheet: ExcelJS.Worksheet): {
    worksheet: ExcelJS.Worksheet;
    headerRowNumber: number;
    columnMap: Map<number, string>;
  } {
    let headerRowNumber = 1;
    let columnMap = new Map<number, string>();
    const lastSearchedRow = Math.min(HEADER_SEARCH_ROWS, worksheet.rowCount);
    for (let rowNumber = 1; rowNumber <= lastSearchedRow; rowNumber += 1) {
      const candidate = new Map<number, string>();
      worksheet
        .getRow(rowNumber)
        .eachCell({ includeEmpty: false }, (cell, colNumber) => {
          const field = normalizeHeader(this.cellText(cell.value));
          if (field) candidate.set(colNumber, field);
        });
      if (candidate.size > columnMap.size) {
        columnMap = candidate;
        headerRowNumber = rowNumber;
      }
    }
    return { worksheet, headerRowNumber, columnMap };
  }

  /** First non-empty cell text above the header row (the list's title). */
  private titleAbove(
    worksheet: ExcelJS.Worksheet,
    headerRowNumber: number,
  ): string | null {
    for (let rowNumber = 1; rowNumber < headerRowNumber; rowNumber += 1) {
      let found: string | null = null;
      worksheet.getRow(rowNumber).eachCell({ includeEmpty: false }, (cell) => {
        const text = this.cellText(cell.value).replace(/\s+/g, ' ').trim();
        if (!found && text) found = text;
      });
      if (found) return found;
    }
    return null;
  }

  private parseSchoolInfo(
    workbook: ExcelJS.Workbook,
  ): RawSchoolImportInfo | null {
    const worksheet = workbook.getWorksheet('Thông tin trường');
    if (!worksheet) return null;

    const columnMap = new Map<number, keyof RawSchoolImportInfo>();
    worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const key = stripDiacritics(toSafeString(cell.value));
      const field = SCHOOL_COLUMN_ALIASES[key];
      if (field) columnMap.set(colNumber, field);
    });
    if (columnMap.size === 0) return null;

    const result = {
      code: '',
      name: '',
      address: '',
      phone: '',
      taxCode: '',
      managerInfo: '',
      salesRepresentative: '',
      bankName: '',
      bankCode: '',
      bankAccountNumber: '',
      bankAccountName: '',
      status: '',
      academicYearName: '',
      academicYearStartDate: '',
      academicYearEndDate: '',
      academicYearStatus: '',
    } satisfies RawSchoolImportInfo;

    const row = worksheet.getRow(2);
    columnMap.forEach((field, colNumber) => {
      const cell = row.getCell(colNumber);
      result[field] = this.cellText(cell.value, cell.text, cell.numFmt).trim();
    });
    return Object.values(result).some(Boolean) ? result : null;
  }

  private cellText(
    raw: ExcelJS.CellValue,
    formattedText?: string,
    numberFormat?: string,
  ): string {
    if (raw === null || raw === undefined) return '';
    const rawUnknown = raw as unknown as Record<string, unknown>;
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
      return [
        raw.getUTCFullYear(),
        String(raw.getUTCMonth() + 1).padStart(2, '0'),
        String(raw.getUTCDate()).padStart(2, '0'),
      ].join('-');
    }
    if (typeof raw === 'number') {
      const zeroMask = numberFormat?.match(/^0+$/)?.[0];
      if (zeroMask && Number.isInteger(raw)) {
        return String(raw).padStart(zeroMask.length, '0');
      }
      if (formattedText?.trim()) return formattedText;
    }
    if (typeof raw === 'object' && Array.isArray(rawUnknown.richText)) {
      return (rawUnknown.richText as { text?: unknown }[])
        .map((part) => toSafeString(part.text))
        .join('');
    }
    if (typeof raw === 'object' && 'text' in rawUnknown) {
      return toSafeString(rawUnknown.text);
    }
    if (typeof raw === 'object' && 'result' in rawUnknown) {
      return toSafeString(rawUnknown.result);
    }
    return toSafeString(raw);
  }
}
