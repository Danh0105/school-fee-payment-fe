import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { Role } from '../../common/enums/role.enum';

export class CreateUserDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty()
  @IsString()
  fullName: string;

  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role: Role;

  @ApiPropertyOptional({
    description:
      'Scope this user to a single school. Leave empty for SUPER_ADMIN, or when scoping via companyId instead.',
  })
  @IsOptional()
  @IsUUID()
  schoolId?: string;

  @ApiPropertyOptional({
    description:
      'Scope this user to every school under this company (typical for a central ACCOUNTANT/CASHIER team). Mutually exclusive with schoolId in practice.',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;
}
