import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeePlan } from './entities/fee-plan.entity';
import { FeePlansService } from './fee-plans.service';
import { FeePlansController } from './fee-plans.controller';
import { AcademicYearsModule } from '../academic-years/academic-years.module';
import { FeeCategoriesModule } from '../fee-categories/fee-categories.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FeePlan]),
    AcademicYearsModule,
    FeeCategoriesModule,
  ],
  providers: [FeePlansService],
  controllers: [FeePlansController],
  exports: [FeePlansService],
})
export class FeePlansModule {}
