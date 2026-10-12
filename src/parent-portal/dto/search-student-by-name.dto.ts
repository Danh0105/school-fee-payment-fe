import {
  ApiHideProperty,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class SearchStudentByNameDto {
  @ApiProperty({
    description:
      'Trường mà học sinh đang theo học — chọn từ GET /parent-auth/schools.',
  })
  @IsUUID()
  schoolId: string;

  @ApiPropertyOptional({
    description:
      'Tên hoặc một phần họ tên của học sinh (không phân biệt hoa thường). Tối thiểu 3 ký tự.',
    example: 'Nguyễn Văn An',
    minLength: 3,
    maxLength: 255,
  })
  @ValidateIf((dto: SearchStudentByNameDto) =>
    [dto.query, dto.search, dto.name, dto.keyword].every(
      (value) => value === undefined,
    ),
  )
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  fullName?: string;

  // Backward-compatible aliases used by existing Mini App builds. Keeping
  // these decorated is required because the global ValidationPipe forbids
  // non-whitelisted properties.
  @ApiHideProperty()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  query?: string;

  @ApiHideProperty()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  search?: string;

  @ApiHideProperty()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  name?: string;

  @ApiHideProperty()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  keyword?: string;
}
