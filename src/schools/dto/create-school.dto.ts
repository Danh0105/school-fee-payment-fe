import {
  ApiHideProperty,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { EntityStatus } from '../../common/enums/status.enum';

export class CreateSchoolDto {
  @ApiPropertyOptional({
    description:
      'Managing company, if fee collection is run by a central back-office team',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiHideProperty()
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ description: 'Tên trường', example: 'ICHI SKILL' })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description: 'Địa chỉ trường',
    example: '231/1 Nguyễn Phúc Chu, Tân Sơn, Hồ Chí Minh 700000, Vietnam',
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'Điện thoại', example: '0900000008' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Mã số thuế', example: '0316660845' })
  @IsOptional()
  @IsString()
  taxCode?: string;

  @ApiPropertyOptional({
    description: 'Thông tin người quản lý',
    example: 'Nguyen Van A',
  })
  @IsOptional()
  @IsString()
  managerInfo?: string;

  @ApiPropertyOptional({
    description: 'Kinh doanh phụ trách',
    example: 'Nguyễn Văn B',
  })
  @IsOptional()
  @IsString()
  salesRepresentative?: string;

  @ApiHideProperty()
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiHideProperty()
  @IsOptional()
  @IsString()
  bankCode?: string;

  @ApiHideProperty()
  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @ApiHideProperty()
  @IsOptional()
  @IsString()
  bankAccountName?: string;

  @ApiPropertyOptional({
    description: 'Trạng thái trường',
    enum: EntityStatus,
    default: EntityStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;
}
