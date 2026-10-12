import {
  ApiHideProperty,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { StudentStatus } from '../../common/enums/status.enum';
import { Gender } from '../entities/student.entity';

export class CreateStudentDto {
  @ApiProperty()
  @IsUUID()
  schoolId: string;

  @ApiHideProperty()
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

  @ApiPropertyOptional({
    minLength: 8,
    maxLength: 72,
    writeOnly: true,
    description:
      'Mật khẩu để phụ huynh truy cập hồ sơ học sinh. Chỉ nhận khi tạo/đổi mật khẩu và không bao giờ được trả về.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  parentPassword?: string;

  @ApiPropertyOptional({ enum: StudentStatus })
  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;
}
