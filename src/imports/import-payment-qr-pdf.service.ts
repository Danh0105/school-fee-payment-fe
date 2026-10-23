import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import Decimal from 'decimal.js';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import type {
  Content,
  ContentTable,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';
import { School } from '../schools/entities/school.entity';
import { AcademicYear } from '../academic-years/entities/academic-year.entity';
import { AppException } from '../common/exceptions/app.exception';
import { ErrorCode } from '../common/constants/error-codes';
import { buildTransferQr } from '../common/utils/vietqr.util';
import { PaymentOrder } from '../payment-orders/entities/payment-order.entity';
import {
  ImportSession,
  ParsedImportRow,
} from './entities/import-session.entity';
import { rowTransferContent } from './import-payment-orders.service';

/** What one slip asks the parent to pay, and where to. */
interface SlipPayment {
  bankLabel: string;
  accountNumber: string;
  accountName: string;
  amount: Decimal;
  transferContent: string;
  qrPayload: string;
  /** The list's NỘI DUNG when the QR carries the order key instead. */
  note: string | null;
}

/** Order created for a row when the list was saved for debt clearing. */
export interface ImportedRowOrder {
  rowNumber: number;
  paymentOrderId: string;
  orderCode: string;
}

interface PaymentSchoolInfo {
  code: string;
  name: string;
  bankName: string | null;
  bankCode: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
}

@Injectable()
export class ImportPaymentQrPdfService {
  constructor(
    @InjectRepository(School)
    private readonly schoolRepository: Repository<School>,
    @InjectRepository(AcademicYear)
    private readonly academicYearRepository: Repository<AcademicYear>,
    @InjectRepository(PaymentOrder)
    private readonly paymentOrderRepository: Repository<PaymentOrder>,
    private readonly config: ConfigService,
  ) {}

  async create(session: ImportSession): Promise<Buffer> {
    if (!session.validRows.length) {
      throw AppException.badRequest(
        ErrorCode.IMPORT_VALIDATION_FAILED,
        'Phiên import không có học sinh hợp lệ để xuất mã QR',
      );
    }

    const ordersByRow = await this.loadSavedOrders(session);
    const savesDebts = Boolean(session.paymentOptions?.createPaymentOrders);
    if (savesDebts && !ordersByRow.size) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_ERROR,
        'Hãy lưu danh sách trước: mã QR động VietinBank được tạo khi lưu',
      );
    }
    const school = await this.resolveSchool(session);
    const academicYearName = await this.resolveAcademicYearName(session);
    const expiresOn = session.paymentOptions?.qrExpiresAt ?? null;

    let slips: { row: ParsedImportRow; payment: SlipPayment }[];
    if (savesDebts) {
      // Saved lists print each order's VietinBank QR; the money goes to the
      // company's collection account, so the school needs no bank account.
      const payee =
        this.config.get<string>('viettinbank.accountName') || school.name;
      slips = session.validRows
        .filter((row) => ordersByRow.has(row.rowNumber))
        .map((row) => {
          const order = ordersByRow.get(row.rowNumber)!;
          return {
            row,
            payment: {
              bankLabel: 'VietinBank',
              accountNumber: order.bankAccountNumber ?? '',
              accountName: payee,
              amount: order.requestedAmount,
              transferContent: order.transferContent,
              qrPayload: order.qrPayload ?? '',
              note: order.legacyTransferContent,
            },
          };
        });
    } else {
      this.assertBankConfiguration(school);
      this.assertPaymentAmounts(session.validRows);
      slips = session.validRows.map((row) => {
        const amount = new Decimal(row.originalAmount);
        const qr = buildTransferQr({
          bankBin: school.bankCode,
          accountNumber: school.bankAccountNumber,
          accountName: school.bankAccountName,
          amount: amount.toFixed(0),
          transferContent: rowTransferContent(row, school.code),
          reusable: expiresOn === null,
        });
        return {
          row,
          payment: {
            bankLabel: school.bankName ?? school.bankCode,
            accountNumber: school.bankAccountNumber,
            accountName: school.bankAccountName,
            amount,
            transferContent: qr.transferContent,
            qrPayload: qr.qrPayload,
            note: null,
          },
        };
      });
    }

    const content: Content[] = slips.map(({ row, payment }, index) => ({
      stack: this.buildPaymentSlip(
        row,
        school.name,
        academicYearName,
        expiresOn,
        payment,
      ),
      ...(index < slips.length - 1 ? { pageBreak: 'after' as const } : {}),
    }));

    const definition: TDocumentDefinitions = {
      pageSize: 'A4',
      pageMargins: [30, 30, 30, 30],
      info: {
        title: `Mã QR thanh toán - ${school.name}`,
        subject: `Phiếu thanh toán cho ${session.validRows.length} học sinh`,
        creator: 'School Fee Payment',
      },
      defaultStyle: {
        font: 'Roboto',
        fontSize: 10,
        color: '#202124',
      },
      content,
    };

    return new Promise<Buffer>((resolve, reject) => {
      try {
        pdfMake
          .createPdf(
            definition,
            undefined,
            undefined,
            pdfFonts as unknown as Record<string, string>,
          )
          .getBuffer((buffer) => resolve(Buffer.from(buffer)));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /** After confirm, slips print exactly the QR stored on each saved order. */
  private async loadSavedOrders(
    session: ImportSession,
  ): Promise<Map<number, PaymentOrder>> {
    const saved = (session.confirmResult?.paymentOrders ??
      []) as ImportedRowOrder[];
    if (!saved.length) return new Map();
    const orders = await this.paymentOrderRepository.find({
      where: { id: In(saved.map((item) => item.paymentOrderId)) },
    });
    const byId = new Map(orders.map((order) => [order.id, order]));
    return new Map(
      saved
        .filter((item) => byId.has(item.paymentOrderId))
        .map((item) => [item.rowNumber, byId.get(item.paymentOrderId)!]),
    );
  }

  private async resolveSchool(
    session: ImportSession,
  ): Promise<PaymentSchoolInfo> {
    const existing = await this.schoolRepository.findOne({
      where: { id: session.schoolId, deletedAt: IsNull() },
    });
    if (existing) return existing;

    const bootstrapSchool = session.bootstrapContext?.school;
    if (bootstrapSchool) return bootstrapSchool;

    throw AppException.notFound(ErrorCode.SCHOOL_NOT_FOUND);
  }

  private async resolveAcademicYearName(
    session: ImportSession,
  ): Promise<string> {
    const existing = await this.academicYearRepository.findOne({
      where: { id: session.academicYearId },
    });
    if (existing) return existing.name;

    const bootstrapAcademicYear = session.bootstrapContext?.academicYear;
    if (bootstrapAcademicYear) return bootstrapAcademicYear.name;

    throw AppException.notFound(ErrorCode.ACADEMIC_YEAR_NOT_FOUND);
  }

  private assertBankConfiguration(
    school: PaymentSchoolInfo,
  ): asserts school is PaymentSchoolInfo & {
    bankCode: string;
    bankAccountNumber: string;
    bankAccountName: string;
  } {
    const missing = [
      !school.bankCode && 'mã BIN ngân hàng',
      !school.bankAccountNumber && 'số tài khoản',
      !school.bankAccountName && 'tên chủ tài khoản',
    ].filter(Boolean);
    if (missing.length) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_ERROR,
        `Trường chưa cấu hình đủ thông tin nhận tiền: ${missing.join(', ')}`,
      );
    }
    if (!school.bankCode || !/^\d{6}$/.test(school.bankCode)) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_ERROR,
        'Mã ngân hàng phải là mã BIN VietQR gồm 6 chữ số',
      );
    }
  }

  private assertPaymentAmounts(rows: ParsedImportRow[]): void {
    const invalidRows = rows
      .filter((row) => {
        try {
          return new Decimal(row.originalAmount).lte(0);
        } catch {
          return true;
        }
      })
      .map((row) => row.rowNumber);
    if (invalidRows.length) {
      throw AppException.badRequest(
        ErrorCode.IMPORT_VALIDATION_FAILED,
        `Chưa có số tiền thanh toán hợp lệ tại dòng: ${invalidRows.join(', ')}`,
      );
    }
  }

  private buildPaymentSlip(
    row: ParsedImportRow,
    schoolName: string,
    academicYearName: string,
    expiresOn: string | null,
    payment: SlipPayment,
  ): Content[] {
    const className = row.className.replace(/^lớp\s+/iu, '').trim();
    const { amount, transferContent, qrPayload } = payment;
    const noteRows: TableCell[][] = payment.note
      ? [
          [
            { text: 'Ghi chú', margin: [5, 9, 5, 9] },
            { text: payment.note, margin: [5, 9, 5, 9] },
          ],
        ]
      : [];

    const accountCell: TableCell = {
      text: payment.accountNumber,
      bold: true,
      fontSize: 12,
      margin: [5, 9, 5, 9],
      borderColor: ['#d93025', '#d93025', '#d93025', '#d93025'],
    };
    const accountLabelCell: TableCell = {
      text: 'Tài khoản thanh toán',
      margin: [5, 9, 5, 9],
      borderColor: ['#d93025', '#d93025', '#d93025', '#d93025'],
    };

    const paymentDetails: ContentTable = {
      table: {
        widths: [130, '*'],
        body: [
          [
            {
              text: 'Thông tin thanh toán',
              bold: true,
              fontSize: 11,
              colSpan: 2,
              margin: [5, 8, 5, 8],
              fillColor: '#f5f7f9',
            },
            {},
          ],
          [
            { text: 'Ngân hàng', margin: [5, 9, 5, 9] },
            {
              text: payment.bankLabel,
              bold: true,
              margin: [5, 9, 5, 9],
            },
          ],
          [accountLabelCell, accountCell],
          [
            { text: 'Đơn vị thụ hưởng', margin: [5, 9, 5, 9] },
            {
              text: payment.accountName,
              bold: true,
              margin: [5, 9, 5, 9],
            },
          ],
          [
            { text: 'Số tiền thanh toán', margin: [5, 9, 5, 9] },
            {
              text: `${this.formatMoney(amount)} VND`,
              bold: true,
              margin: [5, 9, 5, 9],
            },
          ],
          [
            { text: 'Nội dung thanh toán', margin: [5, 9, 5, 9] },
            {
              text: transferContent,
              bold: true,
              margin: [5, 9, 5, 9],
            },
          ],
          ...noteRows,
          [
            { text: 'Hạn thanh toán', margin: [5, 9, 5, 9] },
            {
              text: expiresOn ? this.formatDate(expiresOn) : 'Không thời hạn',
              bold: true,
              margin: [5, 9, 5, 9],
            },
          ],
        ],
      },
      layout: {
        hLineColor: () => '#aeb4b9',
        vLineColor: () => '#aeb4b9',
        hLineWidth: () => 0.7,
        vLineWidth: () => 0.7,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
    };

    return [
      {
        text: schoolName.toUpperCase(),
        alignment: 'center',
        bold: true,
        fontSize: 13,
        margin: [0, 0, 0, 4],
      },
      {
        text: 'PHIẾU THANH TOÁN HỌC PHÍ',
        alignment: 'center',
        bold: true,
        fontSize: 16,
        color: '#0b6b45',
        margin: [0, 0, 0, 14],
      },
      {
        table: {
          widths: [125, '*', 190],
          body: [
            [
              { text: 'Tên học viên', margin: [5, 8, 5, 8] },
              { text: row.fullName, bold: true, margin: [5, 8, 5, 8] },
              {
                text: `Ngày sinh: ${this.formatDate(row.dateOfBirth)}`,
                margin: [5, 8, 5, 8],
              },
            ],
            [
              { text: 'Kỳ thanh toán', margin: [5, 8, 5, 8] },
              {
                text: `Năm học ${academicYearName}`,
                margin: [5, 8, 5, 8],
              },
              {
                text: `Lớp: ${className}`,
                margin: [5, 8, 5, 8],
              },
            ],
          ],
        },
        layout: {
          hLineColor: () => '#7d8388',
          vLineColor: () => '#7d8388',
          hLineWidth: () => 0.7,
          vLineWidth: () => 0.7,
        },
        margin: [0, 0, 0, 18],
      },
      {
        table: {
          widths: [335, '*'],
          body: [
            [
              paymentDetails,
              {
                stack: [
                  {
                    qr: qrPayload,
                    fit: 175,
                    alignment: 'center',
                    margin: [0, 20, 0, 8],
                  },
                  {
                    text: 'Quét mã QR để thanh toán',
                    alignment: 'center',
                    bold: true,
                    fontSize: 9,
                    color: '#4b5156',
                  },
                ],
              },
            ],
          ],
        },
        layout: {
          hLineColor: () => '#7d8388',
          vLineColor: () => '#7d8388',
          hLineWidth: () => 0.7,
          vLineWidth: () => 0.7,
        },
      },
      {
        text: 'Vui lòng không sửa số tiền và nội dung chuyển khoản khi thanh toán.',
        alignment: 'center',
        italics: true,
        color: '#5f6368',
        margin: [0, 14, 0, 0],
      },
    ];
  }

  private formatDate(date: string | null): string {
    if (!date) return '';
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : date;
  }

  private formatMoney(amount: Decimal): string {
    return amount.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
}
