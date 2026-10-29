import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { FeePlanStatus } from '../../common/enums/status.enum';

export class CreateFeePlanDto {
  @ApiProperty()
  @IsUUID()
  schoolId: string;

  @ApiProperty()
  @IsUUID()
  feeCategoryId: string;

  @ApiProperty({
    example: '80000',
    description: 'Decimal string, e.g. 80000.00',
  })
  @IsNumberString()
  unitPrice: string;

  @ApiProperty({
    example: '9',
    description:
      'Số lượng của cả năm học. defaultAmount = unitPrice × quantity; khi gán, tổng này luôn được chia chính xác thành HK1 và HK2.',
  })
  @IsNumberString()
  quantity: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: FeePlanStatus })
  @IsOptional()
  @IsEnum(FeePlanStatus)
  status?: FeePlanStatus;
}
