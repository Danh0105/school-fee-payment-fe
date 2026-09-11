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
      'Number of months for the whole school year (e.g. 9). Use 1 for a one-time, non-recurring fee. A value above 1 bills across HK1/HK2 (half each) instead of the full year at once.',
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
