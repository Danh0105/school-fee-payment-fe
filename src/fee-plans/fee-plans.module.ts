import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeePlan } from './entities/fee-plan.entity';
import { FeePlansService } from './fee-plans.service';
import { FeePlansController } from './fee-plans.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FeePlan])],
  providers: [FeePlansService],
  controllers: [FeePlansController],
  exports: [FeePlansService],
})
export class FeePlansModule {}
