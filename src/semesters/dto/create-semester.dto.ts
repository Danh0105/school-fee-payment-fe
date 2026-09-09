import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { SemesterStatus } from '../../common/enums/status.enum';

export class CreateSemesterDto {
  @ApiProperty()
  @IsUUID()
  academicYearId: string;

  @ApiProperty({ example: 'Học kỳ 1' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'HK1' })
  @IsString()
  code: string;

  @ApiProperty()
  @IsDateString()
  startDate: string;

  @ApiProperty()
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ enum: SemesterStatus })
  @IsOptional()
  @IsEnum(SemesterStatus)
  status?: SemesterStatus;
}
