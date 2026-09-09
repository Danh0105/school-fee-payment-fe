import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ConfirmImportDto {
  @ApiProperty()
  @IsUUID()
  importSessionId: string;
}
