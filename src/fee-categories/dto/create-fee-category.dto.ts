import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { FeeCategoryStatus } from '../../common/enums/status.enum';

export class CreateFeeCategoryDto {
  @ApiProperty()
  @IsUUID()
  schoolId: string;

  @ApiProperty({ example: 'KNS' })
  @IsString()
  code: string;

  @ApiProperty({ example: 'Kỹ năng sống' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accountingCode?: string;

  @ApiPropertyOptional({ enum: FeeCategoryStatus })
  @IsOptional()
  @IsEnum(FeeCategoryStatus)
  status?: FeeCategoryStatus;
}
