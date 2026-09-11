import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MinLength } from 'class-validator';

export class StudentAccessDto {
  @ApiProperty({
    description:
      'Trường mà học sinh đang theo học — chọn từ GET /parent-auth/schools.',
  })
  @IsUUID()
  schoolId: string;

  @ApiProperty({
    description:
      'Mã định danh (CCCD) của học sinh — nhập để vào trang thanh toán của học sinh đó.',
  })
  @IsString()
  @MinLength(1)
  identifierCode: string;
}
