import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumberString,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '../../common/enums/status.enum';

export class PaymentOrderItemInputDto {
  @ApiProperty()
  @IsUUID()
  receivableId: string;

  @ApiPropertyOptional({
    description: 'Defaults to the receivable full outstanding amount',
  })
  @IsOptional()
  @IsNumberString()
  amount?: string;
}

export class CreatePaymentOrderDto {
  @ApiProperty()
  @IsUUID()
  studentId: string;

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
