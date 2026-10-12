import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class ParentLoginDto {
  @ApiProperty({ description: 'Số điện thoại phụ huynh dùng làm tài khoản.' })
  @IsString()
  @MaxLength(20)
  @Matches(/^\+?[0-9 .-]{9,20}$/)
  username: string;

  @ApiProperty({
    description: 'Ngày sinh học sinh theo định dạng DDMMYYYY.',
    example: '15082015',
    writeOnly: true,
  })
  @IsString()
  @Matches(/^\d{8}$/)
  password: string;
}
