import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumberString, IsString } from 'class-validator';
import { AdjustmentType } from '../../common/enums/status.enum';

export class CreateAdjustmentDto {
  @ApiProperty({ enum: AdjustmentType })
  @IsEnum(AdjustmentType)
  type: AdjustmentType;

  @ApiProperty({ example: '50000' })
  @IsNumberString()
  amount: string;

  @ApiProperty()
  @IsString()
  reason: string;
}
