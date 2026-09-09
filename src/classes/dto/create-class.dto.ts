import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ClassStatus } from '../../common/enums/status.enum';

export class CreateClassDto {
  @ApiProperty()
  @IsUUID()
  schoolId: string;

  @ApiProperty()
  @IsUUID()
  academicYearId: string;

  @ApiProperty({ example: '1A1' })
  @IsString()
  code: string;

  @ApiProperty({ example: '1A1' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @IsString()
  grade?: string;

  @ApiPropertyOptional({ enum: ClassStatus })
  @IsOptional()
  @IsEnum(ClassStatus)
  status?: ClassStatus;
}
