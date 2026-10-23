import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { ImportSessionType } from '../entities/import-session.entity';

export class PreviewImportDto {
  @ApiPropertyOptional({
    description:
      'Tên sheet cần import, ví dụ 3A4. Nếu bỏ trống, hệ thống ưu tiên sheet “Dữ liệu import” rồi dùng sheet đầu tiên.',
    example: '3A4',
  })
  @IsOptional()
  @IsString()
  @MaxLength(31)
  sheetName?: string;

  @ApiPropertyOptional({
    description:
      'Không cần gửi khi file có sheet “Thông tin trường”; hệ thống sẽ tự tạo hoặc đối chiếu trường.',
  })
  @IsOptional()
  @IsUUID()
  schoolId?: string;

  @ApiPropertyOptional({
    description:
      'Không cần gửi khi file có thông tin năm học; hệ thống sẽ tự tạo hoặc đối chiếu năm học.',
  })
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @ApiPropertyOptional({
    description: 'Required for RECEIVABLES/COMBINED imports',
  })
  @IsOptional()
  @IsUUID()
  feePlanId?: string;

  @ApiPropertyOptional({
    enum: ImportSessionType,
    default: ImportSessionType.STUDENTS,
  })
  @IsOptional()
  @IsEnum(ImportSessionType)
  type?: ImportSessionType;

  @ApiPropertyOptional({
    description:
      'Lưu để gạch nợ: khi xác nhận, tạo công nợ theo SỐ TIỀN từng dòng và một đơn thanh toán có QR cho mỗi học sinh.',
    default: false,
  })
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) =>
      value === true || value === 'true' || value === '1',
  )
  @IsBoolean()
  createPaymentOrders?: boolean;

  @ApiPropertyOptional({
    description:
      'Ngày hết hạn của QR và đơn thanh toán (YYYY-MM-DD, giờ Việt Nam). Bỏ trống: không thời hạn.',
    example: '2026-11-30',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === '' || value === null ? undefined : value,
  )
  @IsDateString(
    { strict: true },
    { message: 'qrExpiresAt phải là ngày YYYY-MM-DD' },
  )
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'qrExpiresAt phải là ngày YYYY-MM-DD',
  })
  qrExpiresAt?: string;
}
