import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { FeePlanStatus } from '../../common/enums/status.enum';

export class QueryFeePlanDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  schoolId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  feeCategoryId?: string;

  @ApiPropertyOptional({ enum: FeePlanStatus })
  @IsOptional()
  @IsEnum(FeePlanStatus)
  status?: FeePlanStatus;
}
