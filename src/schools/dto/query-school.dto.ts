import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { EntityStatus } from '../../common/enums/status.enum';

export class QuerySchoolDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional({ enum: EntityStatus })
  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;
}
