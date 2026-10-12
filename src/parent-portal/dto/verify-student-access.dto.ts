import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class VerifyStudentAccessDto {
  @ApiProperty({
    description:
      'Token tra cứu ngắn hạn nhận từ POST /parent-auth/search. Token không có quyền đọc hồ sơ hoặc học phí.',
  })
  @IsString()
  @MinLength(1)
  lookupToken: string;

  @ApiProperty({
    description: 'Mã định danh (CCCD) dùng để xác minh phụ huynh.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  identifierCode: string;
}
