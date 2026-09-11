import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { BillingType, FeePlanStatus } from '../../common/enums/status.enum';

export class UpdateFeePlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  semesterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: BillingType })
  @IsOptional()
  @IsEnum(BillingType)
  billingType?: BillingType;

  @ApiPropertyOptional({
    example: '80000',
    description: 'Decimal string, e.g. 80000.00',
  })
  @IsOptional()
  @IsNumberString()
  unitPrice?: string;

  @ApiPropertyOptional({ example: '9', description: 'Number of months/units' })
  @IsOptional()
  @IsNumberString()
  quantity?: string;

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
