import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { EntityStatus } from '../../common/enums/status.enum';

export class CreateSchoolDto {
  @ApiPropertyOptional({
    description:
      'Managing company, if fee collection is run by a central back-office team',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiProperty()
  @IsString()
  code: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taxCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankAccountName?: string;

  @ApiPropertyOptional({ enum: EntityStatus })
  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;
}
