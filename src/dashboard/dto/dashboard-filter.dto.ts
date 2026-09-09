import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class DashboardFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  schoolId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  academicYearId?: string;
}

export class DashboardSeriesQueryDto extends DashboardFilterDto {
  @ApiPropertyOptional({ default: 30, description: 'For revenue-by-day' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(366)
  days?: number = 30;

  @ApiPropertyOptional({ default: 12, description: 'For revenue-by-month' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  months?: number = 12;
}
