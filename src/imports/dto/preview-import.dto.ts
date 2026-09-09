import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ImportSessionType } from '../entities/import-session.entity';

export class PreviewImportDto {
  @ApiProperty()
  @IsUUID()
  schoolId: string;

  @ApiProperty()
  @IsUUID()
  academicYearId: string;

  @ApiPropertyOptional({
    description: 'Required for RECEIVABLES/COMBINED imports',
  })
  @IsOptional()
  @IsUUID()
  feePlanId?: string;

  @ApiPropertyOptional({
    enum: ImportSessionType,
    default: ImportSessionType.COMBINED,
  })
  @IsOptional()
  @IsEnum(ImportSessionType)
  type?: ImportSessionType;
}
