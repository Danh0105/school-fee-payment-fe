import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { FeeAssignmentTargetType } from '../../common/enums/status.enum';

export class CreateFeeAssignmentDto {
  @ApiProperty({ enum: FeeAssignmentTargetType })
  @IsEnum(FeeAssignmentTargetType)
  targetType: FeeAssignmentTargetType;

  @ApiPropertyOptional({
    type: [String],
    description: 'Required when targetType = CLASS',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  classIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Required when targetType = STUDENT',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  studentIds?: string[];

  @ApiPropertyOptional({ description: 'Required when targetType = GRADE' })
  @IsOptional()
  @IsString()
  grade?: string;
}
