import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CurrentAcademicYearDto {
  @ApiProperty({ description: 'Trường cần lấy năm học hiện tại' })
  @IsUUID()
  schoolId: string;
}
