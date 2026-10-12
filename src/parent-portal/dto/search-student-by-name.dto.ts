import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class SearchStudentByNameDto {
  @ApiProperty({
    description:
      'Trường mà học sinh đang theo học — chọn từ GET /parent-auth/schools.',
  })
  @IsUUID()
  schoolId: string;

  @ApiProperty({
    description:
      'Họ tên đầy đủ của học sinh. API chỉ so khớp chính xác (không phân biệt hoa thường) để hạn chế dò quét dữ liệu.',
    example: 'Nguyễn Văn An',
    minLength: 3,
    maxLength: 255,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  fullName: string;
}
