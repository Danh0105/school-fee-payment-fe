import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumberString, IsString } from 'class-validator';
import { DiscountType } from '../../common/enums/status.enum';

export class CreateDiscountDto {
  @ApiProperty({ enum: DiscountType })
  @IsEnum(DiscountType)
  type: DiscountType;

  @ApiProperty({
    example: '50',
    description: 'Amount (FIXED_AMOUNT) or percent 0-100 (PERCENTAGE)',
  })
  @IsNumberString()
  value: string;

  @ApiProperty({ example: 'Học sinh thuộc diện giảm 50%' })
  @IsString()
  reason: string;
}
