import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { BillingType, FeePlanStatus } from '../../common/enums/status.enum';

export class CreateFeePlanDto {
  @ApiProperty()
  @IsUUID()
  schoolId: string;

  @ApiProperty()
  @IsUUID()
  academicYearId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  semesterId?: string;

  @ApiProperty()
  @IsUUID()
  feeCategoryId: string;

  @ApiProperty({ example: 'KNS-2627' })
  @IsString()
  code: string;

  @ApiProperty({ example: 'Học phí môn Kỹ năng sống năm học 2026-2027' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: BillingType })
  @IsEnum(BillingType)
  billingType: BillingType;

  @ApiProperty({
    example: '80000',
    description: 'Decimal string, e.g. 80000.00',
  })
  @IsNumberString()
  unitPrice: string;

  @ApiProperty({ example: '9', description: 'Number of months/units' })
  @IsNumberString()
  quantity: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ enum: FeePlanStatus })
  @IsOptional()
  @IsEnum(FeePlanStatus)
  status?: FeePlanStatus;
}
