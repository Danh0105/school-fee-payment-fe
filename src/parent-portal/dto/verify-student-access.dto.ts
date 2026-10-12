import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class VerifyStudentAccessDto {
  @ApiProperty({
    description:
      'Token tra cứu ngắn hạn nhận từ POST /parent-auth/search. Token không có quyền đọc hồ sơ hoặc học phí.',
  })
  @IsString()
  @MinLength(1)
  lookupToken: string;

  @ApiPropertyOptional({
    description:
      'Mã định danh (CCCD) tùy chọn. Nếu có, backend vẫn đối chiếu trước khi cấp quyền.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  identifierCode?: string;
}
