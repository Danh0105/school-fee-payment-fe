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

const COLUMN_ALIASES: Record<string, string> = {
  'MA HS': 'studentCode',
  'MA DINH DANH': 'identifierCode',
  'MA DINH DANH / CCCD': 'identifierCode',
  CCCD: 'identifierCode',
  'TEN HS': 'fullName',
  'DIA CHI': 'address',
  'SO DT': 'phone',
  LOP: 'classCode',
  'SO LUONG': 'quantity',
  'SO LUONG (THANG)': 'quantity',
  'DON GIA': 'unitPrice',
  'THANH TIEN': 'originalAmount',
  'NOI DUNG CHUYEN KHOAN': 'legacyTransferContent',
  'TEN HANG HOA DICH VU': 'serviceName',
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
  const key = stripDiacritics(header);
  return COLUMN_ALIASES[key] ?? null;
}

@Injectable()
export class ExcelParserService {
  async parse(buffer: Buffer): Promise<RawImportRow[]> {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as never);
    } catch {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_ERROR,
        'File Excel không hợp lệ hoặc bị hỏng',
      );
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_ERROR,
        'File Excel không có sheet dữ liệu',
      );
    }

    const headerRow = worksheet.getRow(1);
    const columnMap = new Map<number, string>();
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const field = normalizeHeader(toSafeString(cell.value));
      if (field) columnMap.set(colNumber, field);
    });

    if (columnMap.size === 0) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_ERROR,
        'Không nhận diện được tiêu đề cột nào trong file Excel',
      );
    }

    const rows: RawImportRow[] = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;

      const values: Record<string, string> = {};
      let hasAnyValue = false;
      columnMap.forEach((field, colNumber) => {
        const cell = row.getCell(colNumber);
        const raw = cell.value;
        let text = '';
        if (raw !== null && raw !== undefined) {
          const rawUnknown = raw as unknown as Record<string, unknown>;
          if (typeof raw === 'object' && 'text' in rawUnknown) {
            text = toSafeString(rawUnknown.text);
          } else if (typeof raw === 'object' && 'result' in rawUnknown) {
            text = toSafeString(rawUnknown.result);
          } else {
            text = toSafeString(raw);
          }
        }
        text = text.trim();
        if (text) hasAnyValue = true;
        values[field] = text;
      });

      if (hasAnyValue) {
        rows.push({ sheet: worksheet.name, rowNumber, values });
      }
    });

    return rows;
  }
}
