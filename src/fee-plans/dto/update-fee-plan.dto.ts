import { PartialType } from '@nestjs/swagger';
import { CreateFeePlanDto } from './create-fee-plan.dto';

export class UpdateFeePlanDto extends PartialType(CreateFeePlanDto) {}
