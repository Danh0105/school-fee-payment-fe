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
    minLength: 8,
    maxLength: 72,
    writeOnly: true,
    description: 'Mật khẩu tài khoản phụ huynh đã đặt trong hồ sơ học sinh.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
