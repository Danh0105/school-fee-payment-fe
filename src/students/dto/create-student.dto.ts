import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEmail, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { StudentStatus } from '../../common/enums/status.enum';
import { Gender } from '../entities/student.entity';

export class CreateStudentDto {
  @ApiProperty()
  @IsUUID()
  schoolId: string;

  @ApiPropertyOptional({ description: 'Auto-generated if omitted' })
  @IsOptional()
  @IsString()
  studentCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  identifierCode?: string;

  @ApiProperty()
  @IsString()
  fullName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

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
  parentName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  parentEmail?: string;

  @ApiPropertyOptional({ enum: StudentStatus })
  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;
}
