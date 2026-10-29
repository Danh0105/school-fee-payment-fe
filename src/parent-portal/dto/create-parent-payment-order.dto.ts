import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PaymentMethod } from '../../common/enums/status.enum';
import { PaymentOrderItemInputDto } from '../../payment-orders/dto/create-payment-order.dto';

/**
 * A parent paying as an individual: only the address the invoice is sent to.
 * No company name, tax code or invoice address is asked for or derived.
 */
export class ParentInvoiceRequestDto {
  @ApiProperty({
    description:
      'Email nhận hóa đơn điện tử; được bỏ khoảng trắng hai đầu và chuyển về chữ thường.',
    example: 'phuhuynh@example.com',
    maxLength: 255,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString({ message: 'email phải là chuỗi' })
  @IsNotEmpty({ message: 'email là bắt buộc' })
  @MaxLength(255, { message: 'email tối đa 255 ký tự' })
  @IsEmail({}, { message: 'email không đúng định dạng' })
  email: string;
}

// Same shape as CreatePaymentOrderDto minus studentId — the parent-portal
// controller injects studentId from the caller's access token instead of
// trusting a client-supplied value.
export class CreateParentPaymentOrderDto {
  @ApiProperty({ type: [PaymentOrderItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaymentOrderItemInputDto)
  items: PaymentOrderItemInputDto[];

  @ApiPropertyOptional({
    enum: PaymentMethod,
    description:
      'Yêu cầu thanh toán QR (VIETQR, BANK_TRANSFER hoặc bỏ trống) luôn được tạo thành QR tài khoản ảo VietinBank.',
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({
    type: ParentInvoiceRequestDto,
    description:
      'Gửi khi phụ huynh muốn nhận hóa đơn điện tử. Hóa đơn chỉ được phát hành sau khi thanh toán được xác nhận.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ParentInvoiceRequestDto)
  invoice?: ParentInvoiceRequestDto;

  @ApiPropertyOptional({
    description:
      'Khóa chống tạo đơn trùng do ứng dụng sinh cho mỗi lần bấm thanh toán. Gửi lại cùng giá trị (bấm lại, mạng gửi lại) sẽ nhận lại đúng đơn đã tạo thay vì tạo đơn mới.',
    example: '4f6c2a1e-8d1b-4e0c-9a57-2b7f0c3d9e11',
    maxLength: 100,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'number' ? String(value) : value,
  )
  @IsString({ message: 'clientRequestId phải là chuỗi' })
  @IsNotEmpty({ message: 'clientRequestId không được rỗng' })
  @MaxLength(100, { message: 'clientRequestId tối đa 100 ký tự' })
  clientRequestId?: string;
}
