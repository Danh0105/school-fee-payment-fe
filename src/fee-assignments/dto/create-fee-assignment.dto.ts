import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { FeeAssignmentTargetType } from '../../common/enums/status.enum';

export class CreateFeeAssignmentDto {
  @ApiProperty({ enum: FeeAssignmentTargetType })
  @IsEnum(FeeAssignmentTargetType)
  targetType: FeeAssignmentTargetType;

  // @IsOptional() alone only skips validation for null/undefined — a client
  // that always sends both arrays and only populates the one matching
  // targetType (leaving the other as []) would otherwise fail ArrayNotEmpty
  // on the unused field. @ValidateIf skips validation entirely unless this
  // is actually the selected targetType, so an irrelevant [] is harmless.
  @ApiPropertyOptional({
    type: [String],
    description: 'Required when targetType = CLASS',
  })
  @ValidateIf(
    (o: CreateFeeAssignmentDto) =>
      o.targetType === FeeAssignmentTargetType.CLASS,
  )
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  classIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Required when targetType = STUDENT',
  })
  @ValidateIf(
    (o: CreateFeeAssignmentDto) =>
      o.targetType === FeeAssignmentTargetType.STUDENT,
  )
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  studentIds?: string[];

  @ApiPropertyOptional({ description: 'Required when targetType = GRADE' })
  @IsOptional()
  @IsString()
  grade?: string;
}
