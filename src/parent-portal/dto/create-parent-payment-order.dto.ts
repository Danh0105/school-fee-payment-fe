import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '../../common/enums/status.enum';
import { PaymentOrderItemInputDto } from '../../payment-orders/dto/create-payment-order.dto';

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

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;
}
